async function api(url, method="GET", body=null, extra={}) {
  const headers = {...extra};
  if (body !== null) headers["Content-Type"]="application/json";
  if (localStorage.token) headers.Authorization="Bearer "+localStorage.token;
  const r = await fetch(url,{method,headers,body:body===null?undefined:JSON.stringify(body)});
  return r.json().catch(()=>({success:false,error:"INVALID_SERVER_RESPONSE"}));
}
function logout(){localStorage.removeItem("token");location.href="/";}
function logoutAdmin(){localStorage.removeItem("adminToken");location.reload();}
