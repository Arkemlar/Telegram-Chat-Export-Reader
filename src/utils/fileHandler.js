export const getRelativePath = (href, basePath) => {
  if (!href) return null;
  const cleanPath = href.replace(/^\.\//, '');
  return basePath + '/' + cleanPath;
};

export const findFileInFolder = async (files, path) => {
  for (const file of files) {
    if (file.webkitRelativePath === path) {
      // Remote files (see listRemoteFolder) already have a URL
      return file.url || URL.createObjectURL(file);
    }
  }
  return null;
};

export const parseHTML = (htmlString) => {
  const parser = new DOMParser();
  return parser.parseFromString(htmlString, 'text/html');
};

// Recursively lists a folder served by nginx with `autoindex_format json`
// and returns file-like objects compatible with the folder picker's File list.
export const listRemoteFolder = async (baseUrl, basePath, subPath = '') => {
  const response = await fetch(baseUrl + subPath);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${baseUrl + subPath}`);
  const entries = await response.json();

  const nested = await Promise.all(entries.map(async (entry) => {
    const relPath = subPath + encodeURIComponent(entry.name);
    if (entry.type === 'directory') {
      return listRemoteFolder(baseUrl, basePath, relPath + '/');
    }
    const url = baseUrl + relPath;
    return [{
      name: entry.name,
      webkitRelativePath: `${basePath}/${decodeURIComponent(relPath)}`,
      url,
      text: () => fetch(url).then(r => r.text())
    }];
  }));
  return nested.flat();
};
