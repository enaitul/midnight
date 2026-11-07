import api from './api'

export const postService = {
  // Public feed with pagination
  getFeed: async (page = 1, perPage = 10) => {
    const res = await api.get(`/posts?page=${page}&per_page=${perPage}`)
    return res.data
  },

  // Single post by ID
  getPostById: async (id) => {
    const res = await api.get(`/posts/${id}`)
    return res.data.post
  },
  getMedia: async id => (await api.get(`/posts/${id}/media`)).data.media,
  getMediaPreview: async url => {
    const apiPath = url.startsWith('/api/') ? url.slice(4) : url
    const { data } = await api.get(apiPath, { responseType: 'blob' })
    return URL.createObjectURL(data)
  },

  // Create post (draft or published)
  createPost: async (title, content, status = 'draft', mediaPending = false) => {
    const res = await api.post('/posts', { title, content, status, media_pending: mediaPending })
    return res.data.post
  },

  addMedia: async (id, files, onProgress) => {
    const data = new FormData()
    files.forEach(file => data.append('files', file))
    const res = await api.post(`/posts/${id}/media`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: event => { if (event.total && onProgress) onProgress(Math.round(event.loaded / event.total * 100)) },
    })
    return res.data.media
  },
  reorderMedia: async (id, order) => {
    const res = await api.put(`/posts/${id}/media/reorder`, { order })
    return res.data.media
  },
  removeMedia: async (id, mediaId) => api.delete(`/posts/${id}/media/${mediaId}`),
  toggleLike: async id => (await api.post(`/posts/${id}/like`)).data,
  getComments: async id => (await api.get(`/posts/${id}/comments`)).data.comments,
  addComment: async (id, body) => (await api.post(`/posts/${id}/comments`, { body })).data,
  toggleCommentLike: async id => (await api.post(`/posts/comments/${id}/like`)).data,

  // Update post
  updatePost: async (id, { title, content, status }) => {
    const res = await api.put(`/posts/${id}`, { title, content, status })
    return res.data.post
  },

  // Delete post
  deletePost: async (id) => {
    const res = await api.delete(`/posts/${id}`)
    return res.data
  },

  // Author's writings (drafts and published)
  getMyPosts: async (status = '', page = 1, perPage = 15) => {
    const statusParam = status ? `&status=${status}` : ''
    const res = await api.get(`/posts/mine?page=${page}&per_page=${perPage}${statusParam}`)
    return res.data
  },
}

