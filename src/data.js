export const categories = [
 {id:'all',name:'随便吃点',sub:'让惊喜发生',image:'feast'},
 {id:'chinese',name:'中餐家常',sub:'一口热气腾腾',image:'chinese'},
 {id:'hotpot',name:'火锅烧烤',sub:'快乐要趁热',image:'hotpot-pot'},
 {id:'noodles',name:'面饭小吃',sub:'认真填饱肚子',image:'noodles'},
 {id:'western',name:'西餐轻食',sub:'换个新口味',image:'western'},
 {id:'japanese',name:'日韩料理',sub:'今天精致一点',image:'japanese'},
 {id:'drinks',name:'咖啡奶茶',sub:'给日常续个杯',image:'drinks'},
 {id:'dessert',name:'甜品烘焙',sub:'甜一点也很好',image:'dessert'},
];
export const categoryName=id=>categories.find(c=>c.id===id)?.name||'美食餐饮';
export const fallbackImage=item=>`/images/${item.image||categories.find(c=>c.id===item.category)?.image||'chinese'}.jpg`;

export const imageFor=item=>typeof item.photo==='string'&&item.photo.startsWith('https://')?item.photo:fallbackImage(item);
