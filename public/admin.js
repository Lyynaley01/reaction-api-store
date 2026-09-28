const A=id=>document.getElementById(id);
function adminHeaders(){return {Authorization:"Bearer "+localStorage.adminToken}}
async function adminFetch(url,opts={}){opts.headers={...(opts.headers||{}),...adminHeaders()};const r=await fetch(url,opts);return r.json()}
async function loadAdmin(){
  const r=await adminFetch("/api/admin/stats");
  if(!r.success){A("adminApp").style.display="none";return}
  A("loginPanel").style.display="none";A("adminApp").style.display="block";
  A("stats").innerHTML=`<div class="stat"><b>${r.stats.users}</b><small>Users</small></div><div class="stat"><b>${r.stats.pending}</b><small>Pending</small></div><div class="stat"><b>${r.stats.successful}</b><small>Successful API</small></div>`;
  const o=await adminFetch("/api/admin/orders");
  A("orders").innerHTML=o.orders.map(x=>`<div class="row"><div><b>${x.id}</b><br>${x.user?.email||"-"} · ${x.coins} coin · ${x.duration}<br>Rp${x.price.toLocaleString("id-ID")} · <span class="status ${x.status}">${x.status}</span>${x.proofUrl?` · <a target="_blank" href="${x.proofUrl}">Lihat bukti</a>`:""}</div>${x.status==="pending"?`<div><button class="btn small" onclick="approve('${x.id}')">Approve</button><button class="btn small danger" onclick="rejectOrder('${x.id}')">Reject</button></div>`:""}</div>`).join("")||"Tidak ada order.";
}
A("adminForm").onsubmit=async e=>{e.preventDefault();const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:A("email").value,password:A("password").value})}).then(x=>x.json());if(r.success){localStorage.adminToken=r.token;loadAdmin()}else A("loginMsg").textContent=r.error}
async function approve(id){const r=await adminFetch("/api/admin/orders/"+id+"/approve",{method:"POST"});alert(r.message||r.error);loadAdmin()}
async function rejectOrder(id){const reason=prompt("Alasan penolakan?","Pembayaran tidak valid.");if(reason===null)return;const r=await adminFetch("/api/admin/orders/"+id+"/reject",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})});alert(r.message||r.error);loadAdmin()}
loadAdmin();
