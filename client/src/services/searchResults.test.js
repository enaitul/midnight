import assert from 'node:assert/strict'
import test from 'node:test'
import { findUserSearchResult, getUserSearchResults } from './searchResults.js'

test('profile message lookup finds the exact user in the search response results', () => {
  const target = { id: 42, username: 'nightreader' }
  const data = { results: [{ id: 7, username: 'reader' }, target], total: 2 }

  assert.equal(findUserSearchResult(data, 'nightreader'), target)
})

test('profile message lookup handles an empty search result', () => {
  assert.equal(findUserSearchResult({ results: [], total: 0 }, 'nightreader'), undefined)
})

test('new conversation picker receives only the result array', () => {
  const people = [{ id: 7, username: 'reader' }]

  assert.deepEqual(getUserSearchResults({ results: people, total: 1 }), people)
})

test('new conversation picker receives an empty array for no matches', () => {
  assert.deepEqual(getUserSearchResults({ results: [], total: 0 }), [])
  assert.deepEqual(getUserSearchResults({ total: 0 }), [])
})

test('profile and picker ignore malformed search entries', () => {
  const data = { results: [null, 'invalid', { id: 3 }, { username: 'missing-id' }, { id: 9, username: 'reader' }] }

  assert.deepEqual(getUserSearchResults(data), [{ id: 9, username: 'reader' }])
  assert.equal(findUserSearchResult(data, 'reader')?.id, 9)
})
