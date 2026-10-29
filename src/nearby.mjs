import {pause} from './api-client.mjs';
import {BATCH_PAGES,MAX_PAGES} from './search-options.mjs';
// Keep paging bounded and below the provider's per-second search limit.
export async function loadNearbyPages(startPage, fetchPage, onPage, signal, wait=pause) {
  for (let page=startPage;page<startPage+BATCH_PAGES&&page<=MAX_PAGES;page++) {
    if (signal.aborted) throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
    if(page>startPage)await wait(500,signal);
    let result;try{result=await fetchPage(page);}catch(e){e.failedPage=page;throw e;}
    if (signal.aborted) throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
    onPage(result);
    if (!result.hasMore) break;
  }
}
