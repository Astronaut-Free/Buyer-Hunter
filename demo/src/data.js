const S = {
  alibaba: "Alibaba RFQ", tradewheel: "TradeWheel", volza: "Volza 贸易数据", go4world: "go4WorldBusiness",
};
const U = {
  a1: "https://sourcing.alibaba.com/rfq/onepage/rfq_detail.htm?p=ID1HvYQogAITlEep670CwCL3To77cJvQAgTV5WBQNZSXKW8CPHODyKQziN8agQ4znSo&searchText=matcha&uuid=83e43855-bd98-4ae6-ac2e-41a52a24764f&lite=true",
  a2: "https://sourcing.alibaba.com/rfq/onepage/rfq_detail.htm?p=ID1NvU9raCeRQMf-sG3vdLdeY-epGCWx7MYj1BLCw15vqeSD7hHBRrLN55glvK_9B2w&searchText=matcha&uuid=83e43855-bd98-4ae6-ac2e-41a52a24764f&lite=true",
  a3: "https://sourcing.alibaba.com/rfq/onepage/rfq_detail.htm?p=ID1naiLIk9LjY3KdbYwdfSrFnVDCtEtkPrjJcMrnRo9n_MBFSy2FMYsovw0N9S6ZboN&language=fr_FR&searchText=tea+leaves&uuid=1034dd8c-f46c-4b3d-9845-b030fb811ecd&lite=true",
  t1: "https://www.tradewheel.com/buyers/bulk-purchase-inquiry-for-oem-private-label-organic/1001443/",
  t2: "https://www.tradewheel.com/buyers/ceremonial-grade-matcha-powder-wanted-for-long-term-supply/986397/",
  us: "https://www.volza.com/p/matcha-green-tea/buyers/buyers-in-united-states/",
  usjp: "https://www.volza.com/p/japanese-matcha-green-tea/buyers/buyers-in-united-states/",
  vn: "https://www.volza.com/p/matcha-green-tea/buyers/buyers-in-vietnam/",
  ph: "https://www.volza.com/p/matcha-green-tea/buyers-directory/buyers-in-philippines/",
  id: "https://www.volza.com/p/matcha-green-tea/buyers/buyers-in-indonesia/",
  g: "https://www.go4worldbusiness.com/buyers/matcha-tea.html?pg_buyers=4&region=worldwide",
  gna: "https://www.go4worldbusiness.com/buyers/north-america/matcha-tea.html",
};

// [type,buyer,country,market,score,confidence,date,demand,quantity,source,url,entity,claim,limitation,nextAction]
const R = [
  ["RFQ","Alibaba RFQ｜Karan Mistry（企业未披露）","美国","US",96,88,"2026-08-28","有机日本绿茶粉 / 即溶抹茶，农残友好条包","10,000 件",S.alibaba,U.a1,"联系人公开，企业主体未披露","公开 RFQ 明确列出有机日本抹茶、条包形式与 10,000 件需求。","企业法定名称与单件克重未公开，需在平台内询盘确认。","立即确认单件克重、认证体系与目的港。"],
  ["RFQ","Alibaba RFQ｜Noora Alhajri（企业未披露）","卡塔尔","QA",91,85,"2026-08-27","日本有机抹茶批发","5 袋",S.alibaba,U.a2,"联系人公开，企业主体未披露","公开 RFQ 标题为 Japanese organic matcha wholesale，并披露 5 袋需求。","包装重量、认证标准和企业主体待确认。","先确认每袋规格与卡塔尔食品进口标签要求。"],
  ["RFQ","Alibaba RFQ｜Ghania Benkedia（企业未披露）","阿尔及利亚","DZ",72,80,"2026-08-27","纯有机抹茶 / 正宗绿茶粉","1 件样品",S.alibaba,U.a3,"联系人公开，企业主体未披露","公开 RFQ 明确询购 pure organic matcha，但当前数量仅 1 件。","更接近打样需求，商业采购量与复购计划尚未形成。","先问目标年用量，不投入大额寄样。"],
  ["RFQ","TradeWheel RFQ｜Amelia Miller（企业未披露）","美国","US",89,78,"2026-07-29","OEM 私标有机抹茶粉","批量，未披露",S.tradewheel,U.t1,"联系人公开，企业主体未披露","买方发布 Bulk Purchase Inquiry，限定 OEM / Private Label / Organic Matcha Powder。","数量、目的港与认证清单未公开，企业实体未解析。","先索取 MOQ、USDA Organic 与私标包装规格。"],
  ["RFQ","TradeWheel RFQ｜Tim（进口分销商，企业未披露）","美国","US",87,77,"2026-06-11","仪式级抹茶长期供应","月度采购，数量未披露",S.tradewheel,U.t2,"角色自述为进口分销商，企业主体未披露","公开买盘写明 ceremonial grade、long-term supply；同联系人另帖自述按月采购。","需排除重复帖子并核验公司、月用量和付款能力。","要求公司信息、月用量和目标价区间。"],

  ["TRADE_RECORD","AIYA AMERICA INC","美国","US",88,94,"2024-11-08","日本抹茶绿茶粉","33 票；最近公开样本 1,080 箱",S.volza,U.usjp,"实名公司，贸易记录验证","Volza 公共页显示 33 票日本抹茶进口；样本记录为 1,080 CTN。","公共页最新可见单票为 2024 年，2026 采购窗口需二次确认。","核验近 90 天进口与第二供应源意向。"],
  ["TRADE_RECORD","HOKUSAN TRADE CANADA CORP","美国/加拿大","US",86,94,"2025-03-17","日本仪式级抹茶","4 票；最近 38 箱",S.volza,U.usjp,"实名公司，贸易记录验证","最近公开记录为 ceremonial grade matcha，HS 0902.20，38 CTN。","公司注册地与美国收货主体关系需核验。","以仪式级和餐饮级双规格询问 2026 补货计划。"],
  ["TRADE_RECORD","DD B SOLUTIONS LLC","美国","US",83,91,"2025-12-01","抹茶绿茶进口","18 票，占公开样本 21%",S.volza,U.us,"实名公司，贸易记录验证","Volza 美国市场页将其列为高量买家，公开统计为 18 票、21% 份额。","免费页未披露最近单票规格与到港日期。","补查具体 BOL、包装规格和现有供应国。"],
  ["TRADE_RECORD","VAHDAM TEAS GLOBAL INC","美国","US",82,91,"2025-12-01","抹茶绿茶进口","14 票，占公开样本 16%",S.volza,U.us,"实名公司，贸易记录验证","Volza 美国市场页将其列为前三买家，公开统计为 14 票、16% 份额。","需确认采购的是成品茶还是可替换的散装原料。","核验产品形态和供应商集中度。"],
  ["TRADE_RECORD","EZAKI GLICO USA CORPORATION","美国","US",76,88,"2025-12-01","抹茶绿茶相关进口","公开页未披露",S.volza,U.us,"实名公司，被列为主要进口商","Volza 美国抹茶买家页将该公司列为主要进口商之一。","免费页未给出该公司的票数与最新单票。","补齐进口票据和具体产品描述。"],

  ["TRADE_RECORD","LAP SON TRADING SERVICE COMPANY LIMITED","越南","VN",92,95,"2025-05-26","Kanes 日本抹茶粉 30g / 300g","70 票；样本 3,000 袋 + 490 袋",S.volza,U.vn,"实名公司，贸易记录验证","公开记录显示 70 票，最近样本含 3,000 袋 30g 与 490 袋 300g 抹茶。","当前主要采购日本品牌成品，替代空间需验证。","以私标成本优势测试第二供应源意向。"],
  ["TRADE_RECORD","AEON TOPVALU VIETNAM CO LTD","越南","VN",86,95,"2025-05-29","TOPVALU 抹茶绿茶袋泡茶","53 票；最近样本 18 件",S.volza,U.vn,"实名公司，贸易记录验证","公开记录显示 53 票，产品为 TOPVALU green tea bags with matcha。","需求为零售成品/复配茶包，不等同于散装纯抹茶。","仅在支持 OEM 茶包或配方原料时进入。"],
  ["TRADE_RECORD","HO GUOM INVESTMENT, TOURIST AND IM-EXPORT CO LTD","越南","VN",75,92,"2024-04-12","Hamasaen 抹茶粉 200g","52 票",S.volza,U.vn,"实名公司，贸易记录验证","公开记录显示 52 票，并展示 Matcha A / Gyomu-Yo Matcha 200g 产品。","免费页可见样本距今较久，必须确认是否仍在采购。","先验证 2025–2026 是否继续进口。"],
  ["TRADE_RECORD","ASIA CHEMICAL CORPORATION LOT K 4B","越南","VN",91,96,"2025-05-28","食品配料级抹茶粉，10kg/箱","46 票；连续两票各 300kg",S.volza,U.vn,"实名公司，贸易记录验证","两条公开记录均为 food ingredients / matcha powder / 10kg CTN，各 300kg。","需确认色泽、农残、粒径与现供应商年度合约。","提供食品配料级 COA、色差与 10kg 工业包装报价。"],
  ["TRADE_RECORD","THOI VUONG CO LTD","越南","VN",97,97,"2025-05-26","食品配料级抹茶绿茶粉，20kg/箱","43 票；样本 4,200kg 与 12,000kg",S.volza,U.vn,"实名公司，贸易记录验证","公开页展示相邻两票 4,200kg 和 12,000kg 工业用抹茶粉进口。","2026 最新补货节奏和目标价未公开。","最高优先：补查最近 BOL 并准备工业级大货报价。"],

  ["TRADE_RECORD","MCASIA FOODTRADE CORPORATION","菲律宾","PH",87,94,"2025-04-11","Hamasaen 日本抹茶粉","42 票",S.volza,U.ph,"实名公司，贸易记录验证","菲律宾买家页显示 42 票，最近公开样本为 HAMASA EN matcha powder。","样本页数量字段为 NA，需补查单票重量。","以食品分销渠道第二供应源切入。"],
  ["TRADE_RECORD","THE SUPERFOOD GROCER PHILIPPINES, INC.","菲律宾","PH",88,95,"2025-02-03","Morihan 抹茶粉 20kg / 1kg","22 票；样本 60 袋 + 40 袋",S.volza,U.ph,"实名公司，贸易记录验证","公开样本同时出现 20kg 与 1kg 包装的 Morihan 抹茶粉。","可能偏高端日本品牌，需确认是否接受中国原产替代。","用盲测样、农残报告和稳定色泽数据验证替代可能。"],
  ["TRADE_RECORD","SHAREE MAE TE","菲律宾","PH",73,88,"2026-02-16","抹茶绿茶进口","22 票",S.volza,U.ph,"实名买家名称，贸易记录验证","菲律宾公开买家榜列出 22 票抹茶绿茶进口。","免费页未展示最近单票产品、日期和数量。","补齐 BOL 明细与公司主体。"],
  ["TRADE_RECORD","HALCHEM INDUSTRIAL SALES, INC.","菲律宾","PH",72,88,"2026-02-16","抹茶绿茶进口","18 票",S.volza,U.ph,"实名公司，贸易记录验证","菲律宾公开买家榜列出 18 票抹茶绿茶进口。","具体是食品原料还是零售成品尚未披露。","核验用途、规格与供应商。"],
  ["TRADE_RECORD","HEALTHY FINDS FOOD TRADING","菲律宾","PH",72,88,"2026-02-16","抹茶绿茶进口","18 票",S.volza,U.ph,"实名公司，贸易记录验证","菲律宾公开买家榜列出 18 票抹茶绿茶进口。","免费页未披露最近单票和采购联系人。","核验有机认证与零售包装需求。"],
  ["TRADE_RECORD","RUSTAN MARKETING SPECIALISTS INC.","菲律宾","PH",70,88,"2026-02-16","抹茶绿茶进口","17 票",S.volza,U.ph,"实名公司，贸易记录验证","菲律宾公开买家榜列出 17 票抹茶绿茶进口。","产品形态与最近采购日期未展示。","判断零售成品采购与原料采购是否同一团队。"],

  ["TRADE_RECORD","PT JERINDO SURYA UTAMA","印度尼西亚","ID",96,97,"2025-06-17","中国绿茶粉抹茶 GT22 / GT23","42 票；同日 500kg + 6,200kg",S.volza,U.id,"实名公司，贸易记录验证","同日两条中国抹茶粉记录分别为 500kg 与 6,200kg。","需确认 GT22/GT23 对应色泽、粒径和农残规格。","以现有中国来源为切入口匹配同级规格。"],
  ["TRADE_RECORD","PT NATURA INTI SUKSES","印度尼西亚","ID",84,94,"2024-07-10","粉末绿茶抹茶 A-KR / F-GN","34 票；样本 20kg + 500kg",S.volza,U.id,"实名公司，贸易记录验证","公开样本显示两种抹茶规格，20kg 与 500kg。","最新可见样本超过一年，当前供应窗口需补证。","先核验近一年是否续购。"],
  ["TRADE_RECORD","PT. ITO EN ULTRAJAYA WHOLESALE","印度尼西亚","ID",87,95,"2025-06-24","绿茶粉 Matcha IT","24 票；最近 180 箱",S.volza,U.id,"实名公司，贸易记录验证","公开记录显示 24 票，最近一票为 GREEN TEA POWDER (MATCHA IT) 180 CAR。","品牌体系可能有既定日本供应链，替换门槛高。","探索餐饮/OEM增量规格。"],
  ["TRADE_RECORD","CV LIBRA FOOD SERVICE","印度尼西亚","ID",78,92,"2025-05-13","Fukujuen 伊右卫门含抹茶玄米茶","12 票；样本 50 箱",S.volza,U.id,"实名公司，贸易记录验证","公开记录显示 12 票，样本为含抹茶玄米茶产品 50 CAR。","采购的是复配成品茶，不是纯抹茶原料。","仅在支持复配茶/OEM时跟进。"],

  ["BUYER_PROFILE","Vexpress","印度","IN",74,76,"2025-04-13","有机日本高端抹茶粉","未披露",S.go4world,U.g,"平台公开买家名称，企业登记待核验","买家档案明确列出 Organic Japanese Matcha Powder Premium Grade。","不是单笔 RFQ，数量和当前采购窗口未披露。","确认当前采购计划、公司注册信息和目标数量。"],
  ["BUYER_PROFILE","Oz Matcha","土耳其","TR",72,75,"2025-06-02","抹茶茶粉","未披露",S.go4world,U.g,"平台公开买家名称，企业登记待核验","买家档案明确标注 Matcha tea powder。","缺少公司官网、数量、规格和截止日期。","确认是零售品牌、经销商还是餐饮采购方。"],
  ["BUYER_PROFILE","The Bobaco","土耳其","TR",71,75,"2025-01-22","抹茶绿茶","未披露",S.go4world,U.g,"平台公开买家名称，企业登记待核验","买家档案明确列出 Matcha green tea。","当前是否仍采购以及应用场景均待确认。","按茶饮渠道问卷核验年用量、等级和包装。"],
  ["BUYER_PROFILE","Sakura","墨西哥","MX",70,73,"2025-05-27","抹茶粉","未披露",S.go4world,U.gna,"平台公开买家名称，主体唯一性待核验","北美买家页公开列出 Sakura，需求为 Matcha powder。","名称通用，无法仅凭页面唯一映射到注册公司。","先完成实体解析，未确认官网前不外推联系人。"],
  ["BUYER_PROFILE","Digital Edge Merchants","美国","US",69,75,"2024-07-30","茶，尤其是抹茶","未披露",S.go4world,U.gna,"平台公开企业名称，注册信息待核验","北美买家页写明 Teas and especially matcha tea。","距今较久，且缺少单笔 RFQ 的数量、规格和期限。","先确认 2026 是否仍有抹茶采购。"],
  ["BUYER_PROFILE","Bubble Tea Shop","法国/沙特","FR",66,68,"2024-02-05","奶茶店使用的各类茶，包括抹茶","未披露",S.go4world,U.g,"描述性名称，企业主体未解析","买家档案指向 bubble tea shop 使用茶类，并归类为 Matcha Tea 买家。","国家字段冲突、企业名称非唯一、窗口过旧。","作为渠道需求证据保留，不进入主动跟进队列。"],
  ["BUYER_PROFILE","M/s Teafirin","孟加拉国","BD",65,72,"2024-08-16","茶、绿茶、乌龙茶及抹茶品类","未披露",S.go4world,U.g,"平台公开企业名称，注册信息待核验","公开买家档案将其列为 Matcha Tea 买家，并展示茶类采购范围。","抹茶并非该档案唯一或明确本期采购品。","先确认抹茶占比与年度采购计划。"],
];

const M = { RFQ:["公开 RFQ","success","窗口打开"], TRADE_RECORD:["采购记录","blue","记录已验证"], BUYER_PROFILE:["买家档案","neutral","窗口待确认"] };
export const opportunities = R.sort((a,b)=>b[4]-a[4]).map((r,index)=>{
  const [signalType,buyerName,country,marketCode,score,confidence,date,demand,quantity,source,url,entity,claim,limit,action]=r;
  const [signalLabel,signalTone,window]=M[signalType];
  const decision = signalType==="RFQ"&&score>=80?"PURSUE_NOW":signalType==="TRADE_RECORD"&&score>=80?"VERIFY_FIRST":"WATCH";
  return { id:`matcha-${String(index+1).padStart(3,"0")}`,rank:index+1,signalType,signalLabel,signalTone,buyerName,country,marketCode,score,truth:confidence,published:date,demand,quantity,sourceName:source,sourceUrl:url,entityStatus:entity,decision,decisionLabel:decision==="PURSUE_NOW"?"立即核验":decision==="VERIFY_FIRST"?"补证后追":"观察复核",decisionTone:decision==="PURSUE_NOW"?"success":decision==="VERIFY_FIRST"?"warning":"neutral",risk:confidence>=90?"低证据风险":confidence>=75?"中证据风险":"高证据风险",window,access:entity.includes("实名公司")?"主体已解析":"主体待核验",accessTone:entity.includes("实名公司")?"success":"warning",whyNow:claim,whyNowReasons:[claim,`买方身份：${entity}`,`数据缺口：${limit}`],action,gap:limit,fit:signalType==="TRADE_RECORD"?82:signalType==="RFQ"?78:62,tags:[signalLabel,country,quantity],evidence:[[date,source,claim,"FACT",url]],matches:[["产品匹配",demand,"贵州抹茶需按规格复核","PASS"],["采购规模",quantity,"按公开字段判断",quantity==="未披露"?"UNKNOWN":"PASS"],["买方主体",entity,"不补写未公开公司",entity.includes("实名公司")?"PASS":"UNKNOWN"]],contact:entity.includes("未披露")?"仅限平台内询盘":"公开联系人未在免费证据页披露",procurementUrl:url,leadAccessStatus:"UNAVAILABLE",categoryCode:"MATCHA"};
});

export const countrySignals = Object.entries(opportunities.reduce((a,x)=>{a[x.country]=(a[x.country]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([country,count])=>[country,count,Math.max(18,Math.round(count/opportunities.length*100))]);

