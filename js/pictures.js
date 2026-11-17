// Slova, která jde jednoznačně ukázat obrázkem (emoji). Používají je hry „Poslouchej“ a „Čti“
// a hry „První hláska“/„Skládej“ obrázek ukážou, když ho slovo má.
// Jen emoji do verze 13 (Android 11+, Samsung One UI), bez složených (ZWJ) sekvencí.
const PICS = {
  // úroveň 1
  NOS:"👃", KOS:"🐦", HAD:"🐍", PES:"🐕", MEČ:"🗡️", MED:"🍯", LED:"🧊", SEN:"😴", BÝK:"🐂", CÍL:"🎯",
  MÍČ:"⚽", ZUB:"🦷", SÝR:"🧀", VÝR:"🦉", NOC:"🌙", DŮM:"🏠", KŮŇ:"🐴", RAK:"🦞", ŠÁL:"🧣", RET:"👄", LES:"🌲",
  // úroveň 2
  ŽÁBA:"🐸", VANA:"🛁", MAPA:"🗺️", MASO:"🥩", ŽENA:"👩", RYBA:"🐟", LYŽE:"🎿", PIVO:"🍺", VÍLA:"🧚", VÍNO:"🍷",
  BOTA:"👟", HORA:"⛰️", KOZA:"🐐", VODA:"💧", MOŘE:"🌊", NOHA:"🦵", NOTA:"🎵", KUŘE:"🐥", LUPA:"🔍", PUSA:"💋",
  RUKA:"✋", RŮŽE:"🌹", ŠATY:"👗", SÁNĚ:"🛷", RÝŽE:"🍚", ZIMA:"⛄", PILA:"🪚", ŠACHY:"♟️",
  // úroveň 3
  BANÁN:"🍌", BALON:"🎈", BALÍK:"📦", BUBEN:"🥁", DÁREK:"🎁", DOMEK:"🏡", HOLUB:"🕊️", HOTEL:"🏨", JAZYK:"👅",
  JEŽEK:"🦔", KABÁT:"🧥", KÁMEN:"🪨", KOLÁČ:"🥧", KOMÁR:"🦟", LABUŤ:"🦢", LAHEV:"🍾", MOTÝL:"🦋", PADÁK:"🪂",
  PALÁC:"🏰", PAPÍR:"📄", POHÁR:"🏆", ZEMĚ:"🌍", BERAN:"🐏", BAZÉN:"🏊", JEŘÁB:"🏗️", LYŽAŘ:"⛷️", PÍSEŇ:"🎶",
  // úroveň 4
  CIBULE:"🧅", ČEPICE:"🧢", HODINY:"🕰️", JAHODA:"🍓", KAMERA:"📷", KORUNA:"👑", KYTARA:"🎸", KYTICE:"💐",
  MĚSÍC:"🌙", PENÍZE:"💰", SEKERA:"🪓", VÁNOCE:"🎄", KOŠILE:"👔", KOBYLA:"🐎", POČASÍ:"🌦️",
  // úroveň 5
  TELEFON:"📱", TULIPÁN:"🌷", KOLOTOČ:"🎠", NETOPÝR:"🦇", DĚDEČEK:"👴", TATÍNEK:"👨", BUDÍČEK:"⏰",
  ZÁKUSEK:"🍰", TALÍŘEK:"🍽️",
  // úroveň 6
  BRÝLE:"👓", DVEŘE:"🚪", KNIHA:"📖", KRÁVA:"🐄", LŽÍCE:"🥄", MLÉKO:"🥛", PRASE:"🐖", ŠKOLA:"🏫", ŠTĚNĚ:"🐶",
  TRÁVA:"🌿", VČELA:"🐝", SVÍCE:"🕯️", STĚNA:"🧱",
  // úroveň 7
  HROZEN:"🍇", CHLAPEC:"👦", KLAVÍR:"🎹", KRÁLÍK:"🐇", KROCAN:"🦃", KŘEČEK:"🐹", SMETÁK:"🧹", ZVONEK:"🔔",
  ŽRALOK:"🦈", PRALES:"🌴",
  // úroveň 8
  KLOBÁSA:"🌭", KRABICE:"📦", KVĚTINA:"🌸", SLEPICE:"🐔", MRAVENEC:"🐜", ZPĚVÁK:"🎤",
  // úroveň 9
  BOBR:"🦫", ČERV:"🪱", ČERT:"😈", DÉŠŤ:"🌧️", DORT:"🎂", KUFR:"🧳", LIST:"🍃", MOST:"🌉", TERČ:"🎯",
  VÍTR:"🌬️", PĚST:"✊", KOST:"🦴",
  // doplněno: slova s obrázkem pro hry Poslouchej a Čti
  LEV:"🦁",   NŮŽ:"🔪",   ČAJ:"🍵",   SŮL:"🧂",   LÉK:"💊",   ŠÍP:"🏹",   KOŠ:"🧺",   MUŽ:"🧔",
  OKO:"👁️",   UCHO:"👂",   MYŠ:"🐭",   PÁV:"🦚",   LOĎ:"⛵",   KÁVA:"☕",   KOLO:"🚲",   AUTO:"🚗",
  MÉĎA:"🧸",   DÝNĚ:"🎃",   DUHA:"🌈",   LAMA:"🦙",   PERO:"🖊️",   HOUBA:"🍄",   SALÁT:"🥗",   MELOUN:"🍉",
  PAVOUK:"🕷️",   LIŠKA:"🦊",   MEDVĚD:"🐻",   ZEBRA:"🦓",   TUČŇÁK:"🐧",   KOČKA:"🐈",   KACHNA:"🦆",   KOHOUT:"🐓",
  OVCE:"🐑",   DELFÍN:"🐬",   ŽELVA:"🐢",   BONBON:"🍬",   NŮŽKY:"✂️",   TUŽKA:"✏️",   BATOH:"🎒",   OHEŇ:"🔥",
  RAKETA:"🚀",   OKURKA:"🥒",   PAPRIKA:"🫑",   OPICE:"🐒",   ŽIRAFA:"🦒",   SUŠENKA:"🍪",   PONOŽKA:"🧦",   HODINKY:"⌚",
  TELEVIZE:"📺",   POČÍTAČ:"💻",   LETADLO:"✈️",   AUTOBUS:"🚌",   SANITKA:"🚑",   MOTORKA:"🏍️",   KOLOBĚŽKA:"🛴",   PAPOUŠEK:"🦜",
  VEVERKA:"🐿️",   VELRYBA:"🐳",   CHOBOTNICE:"🐙",   KUKUŘICE:"🌽",   ČOKOLÁDA:"🍫",   LÍZÁTKO:"🍭",   VAJÍČKO:"🥚",   RUKAVICE:"🧤",
  PASTELKA:"🖍️",   VLAK:"🚂",   SLON:"🐘",   KLAUN:"🤡",   KRÁL:"🤴",   HVĚZDA:"⭐",   KLÍČ:"🔑",   STROM:"🌳",
  DRAK:"🐉",   MRAK:"☁️",   KRAB:"🦀",   ŠNEK:"🐌",   STAN:"⛺",   SLUNCE:"☀️",   TŘEŠNĚ:"🍒",   CHLÉB:"🍞",
  BLESK:"⚡",   SNÍH:"❄️",   TRAKTOR:"🚜",   TRUBKA:"🎺",   KLOBOUK:"🎩",   PRSTEN:"💍",   MRKEV:"🥕",   HRUŠKA:"🍐",
  JABLKO:"🍎",   KLOKAN:"🦘",   VRTULNÍK:"🚁",   BRAMBORA:"🥔",   BROKOLICE:"🥦",   ZMRZLINA:"🍦",   KLADIVO:"🔨",   TYGR:"🐅",
  MÍSA:"🥣",   SOVA:"🦉",   VÁZA:"🏺",   PÁNEV:"🍳",   PŘÍBOR:"🍴", 
};

// Skupiny slov, jejichž obrázky si jsou podobné (na displeji je dítě nemusí rozlišit).
// V jedné otázce se z každé skupiny objeví nejvýš jedno slovo – všechny nabízené obrázky musí být jasně odlišné.
const PIC_GROUPS = [
  ["SOVA", "VÝR"], ["NOC", "MĚSÍC", "HVĚZDA"], ["CÍL", "TERČ"], ["BALÍK", "KRABICE", "DÁREK"],
  ["KŮŇ", "KOBYLA"], ["BÝK", "KRÁVA"], ["PES", "ŠTĚNĚ"], ["KOZA", "BERAN", "OVCE"], ["PRASE"],
  ["KUŘE", "SLEPICE", "KOHOUT", "KROCAN"], ["KOS", "HOLUB", "PAPOUŠEK"], ["MEDVĚD", "MÉĎA"],
  ["MYŠ", "KŘEČEK", "KRÁLÍK"], ["RAK", "KRAB"], ["RYBA", "ŽRALOK", "DELFÍN", "VELRYBA"],
  ["MUŽ", "TATÍNEK", "DĚDEČEK", "CHLAPEC"], ["ŽENA"], ["KVĚTINA", "TULIPÁN", "RŮŽE", "KYTICE"],
  ["LES", "STROM", "PRALES", "LIST", "TRÁVA"], ["HODINY", "BUDÍČEK", "HODINKY"], ["DŮM", "DOMEK", "HOTEL", "ŠKOLA", "PALÁC"],
  ["VODA", "MOŘE"], ["DÉŠŤ", "POČASÍ", "MRAK"], ["ZIMA", "SNÍH", "LED"], ["NOTA", "PÍSEŇ"],
  ["VÍNO", "LAHEV", "PIVO"], ["LŽÍCE", "PŘÍBOR"], ["MÍSA", "RÝŽE"], ["KABÁT", "KOŠILE", "ŠATY"],
  ["DORT", "ZÁKUSEK", "KOLÁČ", "SUŠENKA"], ["BONBON", "LÍZÁTKO"], ["PERO", "TUŽKA", "PASTELKA"],
  ["AUTO", "SANITKA", "AUTOBUS"], ["LETADLO", "VRTULNÍK", "RAKETA"], ["VČELA", "KOMÁR"], ["ČERV", "HAD"],
  ["HORA", "KÁMEN"], ["MEČ", "NŮŽ"], ["ŠÍP", "SEKERA"], ["KOČKA", "TYGR", "LEV"], ["JABLKO", "HRUŠKA"],
  ["MELOUN", "OKURKA"], ["PAPRIKA", "OKURKA"], ["HOUBA", "DÝNĚ"],
];
const PIC_GROUP_OF = {};
PIC_GROUPS.forEach((g, i) => g.forEach(w => { (PIC_GROUP_OF[w] = PIC_GROUP_OF[w] || []).push(i); }));
/** Jsou obrázky dvou slov zaměnitelné? (stejné emoji nebo stejná skupina podobných) */
const picsClash = (a, b) => PICS[a] === PICS[b] || (PIC_GROUP_OF[a] || []).some(g => (PIC_GROUP_OF[b] || []).includes(g));
