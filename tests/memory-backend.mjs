// Test adapter only; production uses Supabase REST and private Storage.
export class MemoryBackend {
  rows=new Map();files=new Map();conflicts=0;loseNextWrite=false;
  async get(code){return structuredClone(this.rows.get(code)||null);}
  async capacity(){}
  async insert(row){if(this.rows.has(row.code))throw Object.assign(new Error('Duplicate'),{status:409});this.rows.set(row.code,structuredClone({...row,created_at:new Date().toISOString()}));}
  async replace(row,data){
    if(this.conflicts){this.conflicts--;return false;}
    const old=this.rows.get(row.code);if(!old||old.version!==row.version)return false;
    this.rows.set(row.code,structuredClone({...old,data,version:row.version+1}));
    if(this.loseNextWrite){this.loseNextWrite=false;throw new Error('Response lost after commit');}return true;
  }
  async upload(path,bytes){this.files.set(path,bytes);}
  async remove(paths){paths.forEach(p=>this.files.delete(p));}
  async sign(path){return 'https://photos.example/'+path;}
  async expired(){return [...this.rows.values()].filter(r=>Date.parse(r.expires_at)<Date.now());}
  async cleanup(row){for(const path of this.files.keys())if(path.startsWith(row.data.storagePrefix+'/'))this.files.delete(path);if(this.rows.get(row.code)?.version===row.version)this.rows.delete(row.code);}
}
