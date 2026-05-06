export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return
  const role = localStorage.getItem('SinkUserRole')
  if (role !== 'admin') {
    return navigateTo('/dashboard/links')
  }
})