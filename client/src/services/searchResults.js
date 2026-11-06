export const getUserSearchResults = data => Array.isArray(data?.results)
  ? data.results.filter(item => item && typeof item === 'object' && Number.isInteger(item.id) && typeof item.username === 'string')
  : []

export const findUserSearchResult = (data, username) =>
  getUserSearchResults(data).find(item => item.username === username)
