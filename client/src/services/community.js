import api from './api'

export const communityService = {
  getProfile: async (username) => (await api.get(`/users/${encodeURIComponent(username)}`)).data.user,
  follow: async username => (await api.post(`/users/${encodeURIComponent(username)}/follow`)).data,
  unfollow: async username => (await api.delete(`/users/${encodeURIComponent(username)}/follow`)).data,
  notifications: async () => (await api.get('/notifications')).data,
  unreadNotifications: async () => (await api.get('/notifications/unread-count')).data.unread_count,
  markAllNotificationsRead: async () => api.post('/notifications/read-all'),
  getMyProfile: async () => (await api.get('/users/me')).data.user,
  updateProfile: async (fields) => (await api.put('/users/me', fields)).data.user,
  uploadAvatar: async (file) => {
    const form = new FormData()
    form.append('avatar', file)
    return (await api.post('/users/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
  },
  getSaved: async () => (await api.get('/users/me/saved')).data.posts,
  getSavedIds: async () => (await api.get('/users/me/saved/ids')).data.ids,
  save: async (postId) => api.post(`/users/me/saved/${postId}`),
  unsave: async (postId) => api.delete(`/users/me/saved/${postId}`),
  search: async (query, type, page = 1, signal) => (await api.get('/search', { params: { q: query, type, page }, signal })).data,
  conversations: async () => (await api.get('/conversations')).data.conversations,
  conversation: async (id) => (await api.get(`/conversations/${id}`)).data.conversation,
  messages: async (id, params = {}) => (await api.get(`/conversations/${id}/messages`, { params })).data,
  sendMessage: async (id, body, replyToId) => (await api.post(`/conversations/${id}/messages`, { body, reply_to_id: replyToId })).data,
  sendMessageWithMedia: async (id, body, files, onProgress, replyToId) => {
    const data = new FormData()
    data.append('body', body)
    if (replyToId) data.append('reply_to_id', replyToId)
    files.forEach(file => data.append('files', file))
    return (await api.post(`/conversations/${id}/messages`, data, {
      onUploadProgress: event => { if (event.total) onProgress(Math.round(event.loaded / event.total * 100)) },
    })).data
  },
  startDirect: async (userId) => (await api.post('/conversations/direct', { user_id: userId })).data.conversation,
  startGroup: async (name, memberIds) => (await api.post('/conversations/groups', { name, member_ids: memberIds })).data.conversation,
  addMembers: async (id, memberIds) => (await api.post(`/conversations/${id}/participants`, { member_ids: memberIds })).data.conversation,
  removeMember: async (id, userId) => api.delete(`/conversations/${id}/participants/${userId}`),
  leaveGroup: async (id) => api.post(`/conversations/${id}/leave`),
  renameGroup: async (id, name) => (await api.put(`/conversations/${id}/name`, { name })).data.conversation,
  markRead: async (id) => api.post(`/conversations/${id}/read`),
}
