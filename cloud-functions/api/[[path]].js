import {handleCloudApi} from '../../server/cloud-handler.mjs';
export async function onRequest(context){return handleCloudApi(context,undefined,{publicOrigin:'https://food.example.com'});}
