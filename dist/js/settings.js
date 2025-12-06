import"./toast-DNfHeScJ.js";/* empty css              *//* empty css               */import{B as m}from"./subscription_presets-DdBWjbH6.js";class v{navButtons;contentSections;themeToggle;toastContainer;constructor(){this.navButtons=null,this.contentSections=null,this.themeToggle=null,this.toastContainer=document.getElementById("zg-toast-container")}initialize(t){this.navButtons=document.querySelectorAll(".nav-btn"),this.contentSections=document.querySelectorAll(".content-section"),this.themeToggle=document.getElementById("toggle-theme"),this.attachNavListeners(),this.attachThemeListener(),this.applyTheme(t.theme||"dark")}attachNavListeners(){!this.navButtons||!this.contentSections||this.navButtons.forEach(t=>{t.addEventListener("click",()=>{const e=t.dataset.section;!this.navButtons||!this.contentSections||(this.navButtons.forEach(s=>s.classList.remove("active")),t.classList.add("active"),this.contentSections.forEach(s=>{s.classList.toggle("active",s.id===e)}))})})}attachThemeListener(){this.themeToggle&&this.themeToggle.addEventListener("change",async()=>{if(!this.themeToggle)return;const t=this.themeToggle.checked?"light":"dark";await chrome.storage.sync.set({theme:t}),this.applyTheme(t),this.showToast("Theme saved!")})}applyTheme(t){this.themeToggle&&(t==="light"?(document.body.classList.add("light-theme"),this.themeToggle.checked=!0):(document.body.classList.remove("light-theme"),this.themeToggle.checked=!1))}showToast(t,e="success"){window.ZenithGuardToastUtils&&window.ZenithGuardToastUtils.showToast?window.ZenithGuardToastUtils.showToast({message:t,type:e}):console.error("ZenithGuard: Toast utility not loaded. Check settings.html")}}class k{settings;expandedDomains=new Set;showToast;constructor(t,e){this.settings=t,this.showToast=e,this.attachEventListeners(),chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this))}initialize(){this.render()}attachEventListeners(){document.body.addEventListener("click",t=>{const s=t.target.closest("button");if(!s)return;const{action:i,type:n,index:a,url:r,rulesetId:o,domain:l}=s.dataset;i==="delete-rule"&&n&&this.deleteRule(n,Number(a)),i==="delete-hiding-domain"&&this.deleteHidingDomain(n,String(a)),i==="add-subscription"&&this.addSubscription(),i==="delete-subscription"&&r&&this.deleteSubscription(r),i==="update-all-lists"&&this.updateAllLists(s),i==="add-heuristic-keyword"&&this.addHeuristicKeyword(),i==="toggle-domain-rules"&&l&&this.toggleDomainRules(l),i==="delete-single-hiding-rule"&&l&&a&&this.deleteSingleHidingRule(l,Number(a))}),document.body.addEventListener("change",t=>{const s=t.target.closest('input[type="checkbox"]');if(!s)return;const{action:i,type:n,index:a,url:r,rulesetId:o}=s.dataset;i==="toggle-rule"&&n&&this.toggleRule(n,Number(a),s.checked),i==="toggle-subscription"&&r&&this.toggleSubscription(r,s.checked),i==="toggle-static-ruleset"&&o&&this.toggleStaticRuleset(o,s.checked)})}async render(){this.renderDefaultBlocklist(),this.renderNetworkBlocklist(),this.renderCustomHidingRules(),this.renderHeuristicKeywords(),await this.renderBundledFilterLists(),this.renderCustomSubscriptions(),this.renderDynamicListStatuses()}async handleStorageChange(t,e){if(e==="sync"&&t.enabledStaticRulesets){this.settings.enabledStaticRulesets=t.enabledStaticRulesets.newValue,await this.renderBundledFilterLists();return}if(e!=="sync"&&e!=="local")return;let s=!1;const i=["defaultBlocklist","networkBlocklist","customHidingRules","heuristicKeywords","filterLists"],n=["malware-list-cache","youtube-rules-cache","tracker-list-cache"];if(e==="sync"){for(const a of i)if(t[a]){const r=a;this.settings[r]=t[a].newValue,s=!0}}e==="local"&&n.some(a=>t[a])&&(s=!0),s&&this.render()}async renderBundledFilterLists(){const t=document.getElementById("bundled-subscriptions-list");if(!t)return;const{enabledStaticRulesets:e}=await chrome.storage.sync.get("enabledStaticRulesets"),s=new Set(e||m.map(i=>i.id));e||await chrome.storage.sync.set({enabledStaticRulesets:Array.from(s)}),t.innerHTML=m.map(i=>{const n=s.has(i.id);return`
                <div class="subscription-card">
                    <div class="subscription-card-header">
                        <h4>${i.name}</h4>
                        <label class="switch">
                            <input type="checkbox" data-action="toggle-static-ruleset" data-ruleset-id="${i.id}" ${n?"checked":""}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <p>${i.description}</p>
                </div>
            `}).join("")}renderCustomSubscriptions(){const t=document.getElementById("custom-subscriptions-tbody");if(!t)return;const e=this.settings.filterLists||[];if(e.length===0){t.innerHTML='<tr><td colspan="6" class="no-rules-message">No custom subscriptions found.</td></tr>';return}t.innerHTML=e.map(s=>{let i="";const n=(s.status||"unknown").toLowerCase();if(n==="updating")i='<div class="status-spinner"></div> <span class="status-text updating">Updating...</span>';else{const a=n==="success"?"success":n==="error"?"error":"unknown";i=`<div class="status-dot ${a}"></div> <span class="status-text ${a}">${s.status||"Unknown"}</span>`}return`
                <tr>
                    <td class="subscription-status-cell">${i}</td>
                    <td class="url-cell" title="${s.url}">${s.url}</td>
                    <td>${s.ruleCount||0}</td>
                    <td>${s.lastUpdated?new Date(s.lastUpdated).toLocaleString():"Never"}</td>
                    <td>
                        <label class="switch">
                            <input type="checkbox" data-action="toggle-subscription" data-url="${s.url}" ${s.enabled?"checked":""}>
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td><button class="btn btn-danger btn-small" data-action="delete-subscription" data-url="${s.url}">Delete</button></td>
                </tr>
            `}).join("")}async addSubscription(){const t=document.getElementById("add-subscription-input");if(!t)return;const e=t.value.trim();if(!e)return;try{new URL(e)}catch{this.showToast("Invalid URL format.","error");return}const s=this.settings.filterLists||[];if(s.some(n=>n.url===e)){this.showToast("This subscription already exists.","error");return}const i={url:e,enabled:!0,status:"new",id:crypto.randomUUID(),name:"Custom List"};s.push(i),await chrome.storage.sync.set({filterLists:s}),chrome.runtime.sendMessage({type:"FORCE_UPDATE_SINGLE_LIST",url:e}),t.value="",this.showToast("Subscription added and is now updating!","success"),this.render()}async deleteSubscription(t){if(!confirm(`Are you sure you want to delete this subscription?

${t}`))return;const e=this.settings.filterLists.filter(s=>s.url!==t);await chrome.storage.sync.set({filterLists:e}),this.showToast("Subscription removed.","success")}async toggleSubscription(t,e){let s=this.settings.filterLists||[];const i=s.find(n=>n.url===t);if(i)i.enabled=e;else if(e){const n={url:t,enabled:!0,status:"new",id:crypto.randomUUID(),name:"Custom List"};s.push(n)}await chrome.storage.sync.set({filterLists:s}),e&&(!i||i.status!=="success")&&chrome.runtime.sendMessage({type:"FORCE_UPDATE_SINGLE_LIST",url:t}),this.showToast("Custom subscription setting saved.","success"),this.render()}async toggleStaticRuleset(t,e){try{const{enabledStaticRulesets:s}=await chrome.storage.sync.get("enabledStaticRulesets"),i=new Set(s||m.map(n=>n.id));e?i.add(t):i.delete(t),await chrome.storage.sync.set({enabledStaticRulesets:Array.from(i)}),await chrome.runtime.sendMessage({type:"APPLY_ALL_RULES"}),this.showToast("Filter list setting saved!","success")}catch(s){console.error("Failed to toggle ruleset:",s),this.showToast("Error saving setting.","error"),this.render()}}async updateAllLists(t){t.disabled=!0,t.textContent="Updating...",await chrome.runtime.sendMessage({type:"FORCE_UPDATE_ALL_FILTER_LISTS"}),this.showToast("Updating all subscriptions and dynamic lists in the background.","success")}async renderDynamicListStatuses(){const t=document.getElementById("malware-list-status"),e=document.getElementById("youtube-list-status"),s=document.getElementById("tracker-list-status");if(!t||!e||!s)return;const i=await chrome.storage.local.get(["malware-list-cache","youtube-rules-cache","tracker-list-cache"]),n=i["malware-list-cache"],a=i["youtube-rules-cache"],r=i["tracker-list-cache"];if(n&&n.domains&&n.domains.length>0?t.innerHTML=`
                <h4>Malware Protection List</h4>
                <div class="status-indicator">
                    <div class="status-dot success"></div>
                    <strong>Active</strong>
                </div>
                <div class="status-details">
                    <p>Last updated: <strong>${new Date(n.lastUpdated).toLocaleString()}</strong></p>
                    <p>Blocking <strong>${n.domains.length.toLocaleString()}</strong> malicious domains.</p>
                </div>
            `:t.innerHTML=`
                <h4>Malware Protection List</h4>
                <div class="status-indicator">
                    <div class="status-dot error"></div>
                    <strong>Inactive or Updating</strong>
                </div>
                <div class="status-details">
                    <p>The list will be fetched automatically in the background.</p>
                </div>
            `,a&&a.rules){const o=(a.rules.regexFilters?.length||0)+(a.rules.urlFilters?.length||0);e.innerHTML=`
                <h4>YouTube Ad-Blocking Rules</h4>
                <div class="status-indicator">
                    <div class="status-dot success"></div>
                    <strong>Active</strong>
                </div>
                <div class="status-details">
                    <p>Last updated: <strong>${new Date(a.lastUpdated).toLocaleString()}</strong></p>
                    <p>Loaded <strong>${o}</strong> dynamic rules.</p>
                </div>
            `}else e.innerHTML=`
                <h4>YouTube Ad-Blocking Rules</h4>
                <div class="status-indicator">
                    <div class="status-dot error"></div>
                    <strong>Inactive or Updating</strong>
                </div>
                <div class="status-details">
                    <p>Dynamic rules will be fetched automatically.</p>
                </div>
            `;if(r&&r.list){const o=Object.values(r.list).reduce((l,y)=>l+(y.domains?.length||0),0);s.innerHTML=`
                <h4>Privacy Insights Trackers</h4>
                <div class="status-indicator">
                    <div class="status-dot success"></div>
                    <strong>Active</strong>
                </div>
                <div class="status-details">
                    <p>Last updated: <strong>${new Date(r.lastUpdated).toLocaleString()}</strong></p>
                    <p>Loaded <strong>${o}</strong> tracker definitions.</p>
                </div>
            `}else s.innerHTML=`
                <h4>Privacy Insights Trackers</h4>
                <div class="status-indicator">
                    <div class="status-dot error"></div>
                    <strong>Inactive or Updating</strong>
                </div>
                <div class="status-details">
                    <p>Dynamic tracker list will be fetched automatically.</p>
                </div>
            `}renderRuleTable(t,e,s,i){const n=document.getElementById(t),a=document.getElementById(e);if(a&&(a.textContent=`(${(s||[]).length})`),!!n){if(!s||s.length===0){n.innerHTML='<tr><td colspan="3" class="no-rules-message">No rules defined.</td></tr>';return}n.innerHTML=s.map((r,o)=>`
            <tr>
                <td class="rule-value-cell" title="${r.value}">${r.value}</td>
                <td>
                    <label class="switch">
                        <input type="checkbox" data-action="toggle-rule" data-type="${i}" data-index="${o}" ${r.enabled?"checked":""}>
                        <span class="slider"></span>
                    </label>
                </td>
                ${i!=="defaultBlocklist"?`<td><button class="btn btn-danger btn-small" data-action="delete-rule" data-type="${i}" data-index="${o}">Delete</button></td>`:""}
            </tr>
        `).join("")}}renderDefaultBlocklist(){const t=this.settings.defaultBlocklist||[],e=document.getElementById("default-blocklist-tbody"),s=document.getElementById("default-blocklist-count");s&&(s.textContent=`(${t.length})`),e&&(e.innerHTML=t.map((i,n)=>{const a=i,r=typeof i=="string"?i:a.value,o=typeof i=="string"?!0:a.enabled;return`
            <tr>
                <td class="rule-value-cell" title="${r}">${r}</td>
                <td>
                    <label class="switch">
                        <input type="checkbox" data-action="toggle-rule" data-type="defaultBlocklist" data-index="${n}" ${o?"checked":""}>
                        <span class="slider"></span>
                    </label>
                </td>
            </tr>
        `}).join(""))}renderNetworkBlocklist(){this.renderRuleTable("network-blocklist-tbody","network-blocklist-count",this.settings.networkBlocklist,"networkBlocklist")}renderHeuristicKeywords(){this.renderRuleTable("heuristic-keywords-tbody","heuristic-keywords-count",this.settings.heuristicKeywords,"heuristicKeywords")}async addHeuristicKeyword(){const t=document.getElementById("add-heuristic-keyword-input");if(!t)return;const e=t.value.trim();if(!e){this.showToast("Keyword cannot be empty.","error");return}const s="heuristicKeywords";let i=this.settings[s]||[];if(i.includes(e)){this.showToast("This keyword already exists.","error");return}i.push(e),await chrome.storage.sync.set({[s]:i}),this.showToast("Heuristic keyword added!","success"),t.value=""}renderCustomHidingRules(){const t=this.settings.customHidingRules||{},e=document.getElementById("hiding-rules-tbody"),s=document.getElementById("hiding-rules-count"),i=Object.keys(t).filter(n=>t[n].length>0);if(s&&(s.textContent=`(${i.length})`),!!e){if(i.length===0){e.innerHTML='<tr><td colspan="3" class="no-rules-message">No rules defined.</td></tr>';return}e.innerHTML=i.map(n=>{const a=t[n],r=this.expandedDomains.has(n);let o=`
            <tr class="domain-row">
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="icon-toggle-btn ${r?"expanded":""}" data-action="toggle-domain-rules" data-domain="${n}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
                        </button>
                        <strong>${n}</strong>
                    </div>
                </td>
                <td>${a.length} rule(s)</td>
                <td style="text-align: right;">
                    <button class="btn btn-danger btn-small" data-action="delete-hiding-domain" data-type="customHidingRules" data-index="${n}">Delete All</button>
                </td>
            </tr>
            `;if(r){const l=a.map((y,p)=>`
                    <div class="rule-item" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <code style="font-size: 11px; word-break: break-all; color: #a5f3fc;">${y.value}</code>
                        <button class="icon-btn-danger" title="Delete Rule" data-action="delete-single-hiding-rule" data-domain="${n}" data-index="${p}">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>
                        </button>
                    </div>
                `).join("");o+=`
                <tr class="details-row">
                    <td colspan="3" style="padding: 0 0 0 34px; background: rgba(0,0,0,0.1);">
                        <div class="rules-list-container" style="padding: 10px 0;">
                            ${l}
                        </div>
                    </td>
                </tr>
                `}return o}).join("")}}toggleDomainRules(t){this.expandedDomains.has(t)?this.expandedDomains.delete(t):this.expandedDomains.add(t),this.renderCustomHidingRules()}async deleteSingleHidingRule(t,e){if(!this.settings.customHidingRules||!this.settings.customHidingRules[t])return;const s=this.settings.customHidingRules[t][e].value;confirm(`Delete this rule?

${s}`)&&(this.settings.customHidingRules[t].splice(e,1),this.settings.customHidingRules[t].length===0&&(delete this.settings.customHidingRules[t],this.expandedDomains.delete(t)),await chrome.storage.sync.set({customHidingRules:this.settings.customHidingRules}),chrome.runtime.sendMessage({type:"REAPPLY_HIDING_RULES"}),this.showToast("Rule deleted.","success"))}async toggleRule(t,e,s){const i=this.settings[t];!Array.isArray(i)||!i[e]||(i[e].enabled=s,await chrome.storage.sync.set({[t]:i}),this.showToast("Rule setting saved!","success"))}async deleteRule(t,e){const s=this.settings[t];!Array.isArray(s)||!s[e]||(s.splice(e,1),await chrome.storage.sync.set({[t]:s}),this.showToast("Rule deleted!","success"))}async deleteHidingDomain(t,e){const s=this.settings[t];!s||!s[e]||confirm(`Are you sure you want to delete all hiding rules for ${e}?`)&&(delete s[e],await chrome.storage.sync.set({[t]:s}),this.showToast(`Rules for ${e} deleted!`,"success"))}}class L{syncSettings;localSettings;blocksTodayEl;totalTrackersEl;totalAdsEl;perfGaugeArc;perfGaugeText;chartSvg;constructor(t,e){this.syncSettings=t,this.localSettings=e,this.blocksTodayEl=document.getElementById("blocks-today"),this.totalTrackersEl=document.getElementById("total-trackers"),this.totalAdsEl=document.getElementById("total-ads"),this.perfGaugeArc=document.querySelector("#performance-impact .gauge-arc"),this.perfGaugeText=document.querySelector("#performance-impact .gauge-text"),this.chartSvg=document.getElementById("activity-chart")}initialize(){this.renderStats(),this.renderPerformanceImpact(),this.renderChart(),chrome.storage.onChanged.addListener((t,e)=>{e==="local"&&(t.dailyBlocks&&(this.renderStats(),this.renderChart()),t.dailyPerformance&&this.renderPerformanceImpact())})}async renderStats(){if(!this.blocksTodayEl||!this.totalAdsEl||!this.totalTrackersEl)return;const t=new Date().toISOString().slice(0,10),{dailyBlocks:e={}}=await chrome.storage.local.get("dailyBlocks"),s=e[t]||{ads:0,trackers:0},i=Object.values(e).reduce((n,a)=>(n.ads+=a.ads||0,n.trackers+=a.trackers||0,n),{ads:0,trackers:0});this.blocksTodayEl.textContent=(s.ads+s.trackers).toLocaleString(),this.totalAdsEl.textContent=i.ads.toLocaleString(),this.totalTrackersEl.textContent=i.trackers.toLocaleString()}async renderPerformanceImpact(){const{dailyPerformance:t={}}=await chrome.storage.local.get("dailyPerformance"),e=Object.values(t).reduce((i,n)=>(i.totalWeight+=n.totalWeight||0,i.blockedWeight+=n.blockedWeight||0,i),{totalWeight:0,blockedWeight:0}),s=e.totalWeight>0?Math.round(e.blockedWeight/e.totalWeight*100):0;this.updateGauge(s)}updateGauge(t){if(!this.perfGaugeArc||!this.perfGaugeText)return;const e=2*Math.PI*54,s=t/100*e;this.perfGaugeArc.style.strokeDasharray=`${s}, ${e}`,this.perfGaugeText.textContent=`${t}%`}async renderChart(){if(!this.chartSvg)return;const{dailyBlocks:t={}}=await chrome.storage.local.get("dailyBlocks"),e=[],s=[];for(let d=6;d>=0;d--){const u=new Date;u.setDate(u.getDate()-d);const h=u.toISOString().slice(0,10);e.push(h);const g=t[h]||{ads:0,trackers:0};s.push(g.ads+g.trackers)}const i=Math.max(...s,10),n=800,a=200,r=20,o=s.map((d,u)=>{const h=u/(s.length-1)*(n-2*r)+r,g=a-d/i*(a-2*r)-r;return`${h},${g}`}).join(" "),l=`
            <defs>
                <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.5"/>
                    <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
                </linearGradient>
            </defs>
        `,y=o.split(" ")[0],p=o.split(" ")[o.split(" ").length-1],f=`
            <path d="M ${o} L ${p.split(",")[0]},${a} L ${y.split(",")[0]},${a} Z" 
                  fill="url(#chartGradient)" stroke="none" />
        `,b=`
            <path d="M ${o}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        `,w=s.map((d,u)=>{const h=u/(s.length-1)*(n-2*r)+r,g=a-d/i*(a-2*r)-r;return`<circle cx="${h}" cy="${g}" r="4" fill="#fff" stroke="#3b82f6" stroke-width="2">
                        <title>${e[u]}: ${d} blocked</title>
                    </circle>`}).join("");this.chartSvg.innerHTML=l+f+b+w}}class T{hasApiKey;showToast;apiKeyInput;saveBtn;constructor(t,e){this.hasApiKey=!!t.geminiApiKey,this.showToast=e,this.apiKeyInput=document.getElementById("api-key-input"),this.saveBtn=document.getElementById("save-api-key-btn")}initialize(){!this.apiKeyInput||!this.saveBtn||(this.hasApiKey?this.apiKeyInput.placeholder="•••••••••••••••• (key saved)":this.apiKeyInput.placeholder="Enter your Gemini API key",this.saveBtn.addEventListener("click",async()=>{if(!this.apiKeyInput)return;const t=this.apiKeyInput.value.trim();if(!t&&this.hasApiKey){this.showToast("API key unchanged.","info");return}if(!t){this.showToast("Please enter a valid API key.","error");return}await chrome.storage.sync.set({geminiApiKey:t}),this.showToast("API key saved successfully!","success"),this.hasApiKey=!0,this.apiKeyInput.value="",this.apiKeyInput.placeholder="•••••••••••••••• (key saved)"}))}}class S{history;showToast;tbody;clearBtn;constructor(t,e){this.history=t.auditHistory||[],this.showToast=e,this.tbody=document.getElementById("audit-history-tbody"),this.clearBtn=document.getElementById("clear-history-btn")}initialize(){this.render(),this.attachEventListeners()}render(){if(!this.tbody){console.error("Audit history table body not found!");return}if(this.tbody.innerHTML="",this.history.length===0){this.tbody.innerHTML='<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">No scan history found.</td></tr>';return}[...this.history].sort((e,s)=>s.date-e.date).forEach(e=>{const s=document.createElement("tr"),i=`grade-${e.grade.toLowerCase()}`,n=chrome.runtime.getURL(`src/pages/analyzer.html?tabId=-1&url=${encodeURIComponent(e.url)}`);s.innerHTML=`
                <td>${e.domain}</td>
                <td>${new Date(e.date).toLocaleString()}</td>
                <td><span class="grade-badge ${i}">${e.grade}</span></td>
                <td>${e.threatCount}</td>
                <td><button class="btn btn-primary re-run-btn" data-url="${n}">Re-run</button></td>
            `,this.tbody.appendChild(s)})}attachEventListeners(){!this.clearBtn||!this.tbody||(this.clearBtn.addEventListener("click",async()=>{confirm("Are you sure you want to clear the entire audit history? This cannot be undone.")&&(await chrome.storage.local.set({auditHistory:[]}),this.history=[],this.showToast("Audit history cleared!","success"),this.render())}),this.tbody.addEventListener("click",t=>{const e=t.target;e.classList.contains("re-run-btn")&&chrome.tabs.create({url:e.dataset.url})}),chrome.storage.onChanged.addListener((t,e)=>{if(e==="local"&&t.auditHistory){const s=t.auditHistory;this.history=s.newValue||[],this.render()}}))}}class E{showToast;exportBtn;importBtn;importFileInput;resetBtn;constructor(t){this.showToast=t,this.exportBtn=document.getElementById("export-btn"),this.importBtn=document.getElementById("import-btn"),this.importFileInput=document.getElementById("import-file-input"),this.resetBtn=document.getElementById("reset-btn")}initialize(){this.attachEventListeners()}attachEventListeners(){!this.exportBtn||!this.importBtn||!this.importFileInput||!this.resetBtn||(this.exportBtn.addEventListener("click",this.exportSettings.bind(this)),this.importBtn.addEventListener("click",()=>this.importFileInput?.click()),this.importFileInput.addEventListener("change",this.importSettings.bind(this)),this.resetBtn.addEventListener("click",this.resetSettings.bind(this)))}async exportSettings(){const t=await chrome.storage.sync.get(null),e=JSON.stringify(t,null,2),s=new Blob([e],{type:"application/json"}),i=URL.createObjectURL(s),n=document.createElement("a");n.href=i,n.download=`zenithguard-settings-${new Date().toISOString().split("T")[0]}.json`,n.click(),URL.revokeObjectURL(i),this.showToast("Settings exported!","success")}importSettings(t){const e=t.target,s=e.files?.[0];if(!s)return;const i=new FileReader;i.onload=async n=>{try{if(!n.target?.result)throw new Error("File empty");const a=JSON.parse(n.target.result);if(typeof a!="object"||!a.hasOwnProperty("isHeuristicEngineEnabled"))throw new Error("Invalid settings file format.");await chrome.storage.sync.set(a),this.showToast("Settings imported successfully! Reloading...","success"),setTimeout(()=>location.reload(),1500)}catch(a){const r=a instanceof Error?a.message:"Unknown error";this.showToast(`Error importing settings: ${r}`,"error")}},i.readAsText(s),e.value=""}resetSettings(){confirm("Are you sure you want to reset all rules to their defaults? This will clear your custom hiding rules, network blocklist, and popup list.")&&chrome.runtime.sendMessage({type:"RESET_SETTINGS_TO_DEFAULTS"},t=>{t?.success?(this.showToast("Settings reset successfully! Reloading...","success"),setTimeout(()=>location.reload(),1500)):this.showToast("Failed to reset settings.","error")})}}class I{settings;showToast;toggles;youtubeRulesInput;trackerListInput;saveAdvancedBtn;constructor(t,e){this.settings=t,this.showToast=e,this.toggles=document.querySelectorAll('.setting-item input[type="checkbox"]'),this.youtubeRulesInput=document.getElementById("youtube-rules-url"),this.trackerListInput=document.getElementById("tracker-list-url"),this.saveAdvancedBtn=document.getElementById("save-advanced-settings")}initialize(){this.loadSettings(),this.attachEventListeners()}loadSettings(){this.toggles.forEach(t=>{const e=t.dataset.setting;this.settings.hasOwnProperty(e)&&(t.checked=!!this.settings[e])}),this.youtubeRulesInput&&this.settings.youtubeRulesUrl&&(this.youtubeRulesInput.value=this.settings.youtubeRulesUrl),this.trackerListInput&&this.settings.trackerListUrl&&(this.trackerListInput.value=this.settings.trackerListUrl)}attachEventListeners(){this.toggles.forEach(t=>{t.addEventListener("change",this.handleToggleChange.bind(this))}),this.saveAdvancedBtn&&this.saveAdvancedBtn.addEventListener("click",this.handleSaveAdvancedSettings.bind(this))}async handleToggleChange(t){const e=t.target,s=e.dataset.setting,i=e.checked;await chrome.storage.sync.set({[s]:i}),this.settings[s]=i,this.showToast("Setting saved!","success")}async handleSaveAdvancedSettings(){if(!this.youtubeRulesInput||!this.trackerListInput)return;const t=this.youtubeRulesInput.value.trim(),e=this.trackerListInput.value.trim();if(t&&!this.isValidUrl(t)){this.showToast("Invalid YouTube Rules URL","error");return}if(e&&!this.isValidUrl(e)){this.showToast("Invalid Tracker List URL","error");return}await chrome.storage.sync.set({youtubeRulesUrl:t,trackerListUrl:e}),this.settings.youtubeRulesUrl=t,this.settings.trackerListUrl=e,this.showToast("Advanced settings saved!","success")}isValidUrl(t){try{return new URL(t),!0}catch{return!1}}}document.addEventListener("DOMContentLoaded",async()=>{const c=await chrome.storage.sync.get(null),t=await chrome.storage.local.get(["dailyBlocks","auditHistory"]),e=new v;e.initialize(c),new I(c,e.showToast).initialize(),new k(c,e.showToast).initialize(),new L(c,t).initialize(),new T(c,e.showToast).initialize(),new S(t,e.showToast).initialize(),new E(e.showToast).initialize()});
