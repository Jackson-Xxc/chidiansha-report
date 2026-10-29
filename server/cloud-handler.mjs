import {handleApi} from './api.mjs';
import {httpsFetch} from './https-fetch.mjs';

export async function handleCloudApi(context,fetcher=httpsFetch,options={}){
 const headers=new Headers(context.request.headers);
 if(context.clientIp)headers.set('eo-connecting-ip',context.clientIp);
 const request={url:context.request.url,method:context.request.method,headers,text:()=>context.request.text()};
 return handleApi(request,context.env,fetcher,options);
}
