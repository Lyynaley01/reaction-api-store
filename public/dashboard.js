const $=id=>document.getElementById(id);
let me=null;
let packages=[];
async function load(){
  const r=await api("/api/me");
  if(!r.success){location.href="/login.html";return}
  me=r.user;
  $("hello").textContent="Hi, "+me.name;
  $("coins").textContent=me.coins;
  $("key").textContent=me.apiKey;
  await loadPackages();
  loadOrders();loadUsage();
}
async function loadPackages(){
  const r=await api("/api/packages");
  if(!r.success) return;
  packages=r.packages||[];
  const select=$("duration");
  select.innerHTML=packages.map(p=>`<option value="${p.duration}">${p.name}</option>`).join('');
  select.onchange=updatePrice;
  updatePrice();
}
function updatePrice(){
  const p=packages.find(x=>x.duration===$("duration").value);
  if(!p)return;
  $("buyCoins").value=p.coins;
  $("buyCoins").readOnly=true;
  $("buyCoins").step=1;
  $("packageInfo").textContent=p.description||'';
  $("price").textContent="Rp"+Number(p.price).toLocaleString("id-ID");
}
async function createOrder(){
  const p=packages.find(x=>x.duration===$("duration").value);
  if(!p)return;
  const r=await api("/api/orders","POST",{coins:p.coins,duration:p.duration});
  $("orderMsg").textContent=r.success?`Order ${r.order.id} dibuat. Total Rp${r.order.price.toLocaleString("id-ID")}. Upload bukti setelah pembayaran.`:r.error;
  loadOrders();
}
async function loadOrders(){
  const r=await api("/api/orders");
  $("orders").innerHTML=r.orders?.length?r.orders.map(o=>`<div class="row"><div><b>${o.id}</b><br>${o.coins} coin · ${o.duration} · Rp${o.price.toLocaleString("id-ID")}</div><span class="status ${o.status}">${o.status}</span>${o.status==="pending"?`<label class="upload">Upload bukti<input type="file" accept="image/*,.pdf" onchange="proof('${o.id}',this.files[0])"></label>`:""}</div>`).join(""):"Belum ada order.";
}
async function proof(id,file){
  if(!file)return;
  const fd=new FormData();fd.append("proof",file);
  const r=await fetch("/api/orders/"+id+"/proof",{method:"POST",headers:{Authorization:"Bearer "+localStorage.token},body:fd});
  const j=await r.json();alert(j.success?"Bukti berhasil dikirim.":j.error);loadOrders();
}
async function loadUsage(){
  const r=await api("/api/usage");
  $("usage").innerHTML=r.usage?.length?r.usage.map(x=>`<div class="row"><div><b>${x.reaction}</b> · ${x.status}<br><small>${x.url}</small></div><span>${x.coinUsed} coin</span></div>`).join(""):"Belum ada penggunaan.";
}
function copyKey(){navigator.clipboard.writeText(me.apiKey);alert("API key disalin.");}
async function regen(){if(!confirm("Regenerate API key? Key lama langsung tidak berlaku."))return;const r=await api("/api/me/regenerate-key","POST");if(r.success){me.apiKey=r.apiKey;$("key").textContent=r.apiKey}}
load();
