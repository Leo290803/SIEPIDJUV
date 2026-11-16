import React from 'react';
export default function ServerPagination({total=0,offset=0,limit=25,loading,onPage}) {
 return <div className="table-pagination" aria-label="Paginação dos registros"><span>{total ? `${offset+1} a ${Math.min(offset+limit,total)} de ${total}` : '0 registros'}</span><div><button className="secondary" disabled={loading||offset===0} onClick={()=>onPage(Math.max(0,offset-limit))}>Anterior</button><span className="page-number">{Math.floor(offset/limit)+1}</span><button className="secondary" disabled={loading||offset+limit>=total} onClick={()=>onPage(offset+limit)}>Próxima</button></div></div>;
}
