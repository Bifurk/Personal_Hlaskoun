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
};
