async function request(body){const r=await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const data=await r.json().catch(()=>({})); if(!r.ok)throw new Error(data.error||'AI 服務暫時無法使用'); return data;} export const lookupWord=word=>request({action:'lookup',word}); export const scanImage=(data,mimeType)=>request({action:'image',image:{data,mimeType}});
export const explainText=text=>request({action:'explain',word:text});
export const summarizeChapter=text=>request({action:'summary',word:text});
export const chapterQuestions=text=>request({action:'questions',word:text});
