export function pagePlan(route, filters = {}, offset = 0) {
  const schoolId = route.schoolId;
  const role = {Atletas:'athlete','Comissão técnica':'staff',Responsáveis:'responsible'}[route.page];
  const mode = role ? 'people' : ['Inscrições','Minhas inscrições'].includes(route.page) ? 'registrations' : route.page === 'Visão geral' ? 'dashboard' : route.page === 'Notificações' ? 'notifications' : 'light';
  return {mode,role,schoolId,filters:{...filters,status:filters.status || (role === 'responsible' ? 'Todos' : role ? 'active' : 'all')},offset,limit:25,
    detailId:mode==='people' ? route.recordId : mode==='registrations' ? route.registrationId : null,
    edit:mode==='registrations' && ['newRegistration','editRegistration'].includes(route.action)};
}
