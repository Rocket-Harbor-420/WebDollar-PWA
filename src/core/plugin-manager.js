/*
 * WebDollar PWA - Módulo: plugin-manager.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
export class PluginManager{
  #records=new Map();
  constructor(hooks,events){
    this.hooks=Object.freeze(hooks);this.events=events;
    events.on('module:error',({id,error})=>{const record=this.#records.get(id);if(record)this.#fail(record,error);});
  }
  register(plugin){
    if(!plugin?.id||typeof plugin.init!=='function'||this.#records.has(plugin.id))throw new Error('Módulo inválido o duplicado.');
    this.#records.set(plugin.id,{plugin,status:'registered',error:null});
  }
  #fail(record,error){
    record.status='failed';record.error=error?.message||String(error||'Error del módulo');
    try{record.plugin.dispose?.();}catch{}
  }
  async initializeAll(){for(const id of this.#records.keys())await this.initialize(id);}
  async initialize(id){
    const record=this.#records.get(id);if(!record||record.status==='active')return;
    try{await record.plugin.init(this.hooks);record.status='active';this.events.emit('module:ready',{id});}
    catch(error){this.#fail(record,error);this.events.emit('module:error',{id,error:{message:error.message}});}
  }
  getStatus(id){return this.#records.get(id)?.status||'unknown';}
  list(){return [...this.#records.values()].map(({plugin,status,error})=>({id:plugin.id,name:plugin.name,status,error}));}
}
