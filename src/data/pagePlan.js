export function pagePlan(route, filters = {}, offset = 0) {
  const schoolId = route.schoolId;
  const role = {Atletas:'athlete','Comissão técnica':'staff',Responsáveis:'responsible'}[route.page];
  const mode = role ? 'people' : ['Inscrições','Minhas inscrições'].includes(route.page) ? 'registrations' : route.page === 'Visão geral' ? 'dashboard' : route.page === 'Notificações' ? 'notifications' : 'light';
  const schoolRegistrations = mode === 'registrations' && (route.area === 'escola' || route.schoolContext);
  return {mode,role,schoolId:schoolId || (mode==='registrations' ? filters.schoolId || undefined : undefined),filters:{...filters,...(schoolRegistrations ? {excludeCancelled:true,browseRegistrations:true} : {}),status:filters.status || (role === 'responsible' ? 'Todos' : role ? 'active' : 'all')},offset,limit:mode === 'registrations' ? 10 : 25,
    detailId:mode==='people' ? route.recordId : mode==='registrations' ? route.registrationId : null,
    edit:mode==='registrations' && ['newRegistration','editRegistration'].includes(route.action)};
}
