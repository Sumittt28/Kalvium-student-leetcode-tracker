import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Parse LeetCode username from various formats
function extractHandle(raw: string): string | null {
  if (!raw || raw === 'absent' || raw.trim() === '') return null;
  
  const trimmed = raw.trim().replace(/^"|"$/g, '').replace(/\n/g, '');
  
  // Format: "Username - LeetCode Profile"
  if (trimmed.includes(' - LeetCode Profile')) {
    return trimmed.split(' - ')[0].trim();
  }
  
  // Format: https://leetcode.com/u/username/ or https://leetcode.com/u/username
  const match = trimmed.match(/leetcode\.com\/u\/([^\/\s]+)/i);
  if (match) return match[1];
  
  return null;
}

const JECRC_DATA = `
aditya.rane.s63@kalvium.community	https://leetcode.com/u/LnRdG0c2Tk/
aflah.haami.s63@kalvium.community	https://leetcode.com/u/Aflah_Haami/
ankit.manghnani.s63@kalvium.community	https://leetcode.com/u/manghnaniankit/
anuj.goyal.s63@kalvium.community	https://leetcode.com/u/AnujGoyal239/
arnav.lihantu.s63@kalvium.community	https://leetcode.com/u/ArnavLihantu/
divya.dadhich.s63@kalvium.community	https://leetcode.com/u/Divxoxo15/
hasan.wajie.s63@kalvium.community	https://leetcode.com/u/hansanjava/
nidhi.namdev.s63@kalvium.community	https://leetcode.com/u/Nidhi_Namdev/
palchhi.jain.s63@kalvium.community	https://leetcode.com/u/Palchhi_Jain/
parth.sarawgi.s63@kalvium.community	https://leetcode.com/u/ZZpWkdwdS3/
parv.jhanwar.s63@kalvium.community	https://leetcode.com/u/paaruuu/
prithvi.singh.s63@kalvium.community	https://leetcode.com/u/amberfarmer/
saksham.gupta.s63@kalvium.community	https://leetcode.com/u/jZopELbdUq/
sameer.shrotriya.s63@kalvium.community	https://leetcode.com/u/zAbfwQ42Pk/
satvik.jain.s63@kalvium.community	https://leetcode.com/u/Satvik182/
shivangi.sharma.s63@kalvium.community	https://leetcode.com/u/shvngishrma
suhaan.sharma.s63@kalvium.community	Suhaancodes13 - LeetCode Profile
tanishq.singhal.s63@kalvium.community	https://leetcode.com/u/QabPzH9bTP/
tejraj.singh.s63@kalvium.community	https://leetcode.com/u/bHpEegvhWg/
vishwajeet.dubey.s63@kalvium.community	https://leetcode.com/u/7DbD7aU1Ae/
alok.agrahari.s64@kalvium.community	https://leetcode.com/u/Alok_Agrahari/
divyanshu.peswani.s64@kalvium.community	https://leetcode.com/u/Divyanshu12_18/
gaurang.mishra.s64@kalvium.community	https://leetcode.com/u/gaurang_1221/
glory.jain.s64@kalvium.community	https://leetcode.com/u/glory0230/
harshita.soni.s64@kalvium.community	https://leetcode.com/u/harshita_soni_15/
ishita.gupta.s64@kalvium.community	https://leetcode.com/u/Ishita_Gupta02/
jayant.kumawat.s64@kalvium.community	https://leetcode.com/u/JayantX07/
kartik.choudhary.s64@kalvium.community	https://leetcode.com/u/Kartik_Dumb_007/
krish.agarwal.s64@kalvium.community	https://leetcode.com/u/krish478/
krish.jain.s64@kalvium.community	https://leetcode.com/u/KYjENzrD7H/
namonarayan.mina.s64@kalvium.community	https://leetcode.com/u/NamonarayanMeena/
rashi.rawal.s64@kalvium.community	https://leetcode.com/u/_rashi_11/
rohan.singh.s64@kalvium.community	https://leetcode.com/u/rohan_9443/
saanvi.garg.s64@kalvium.community	https://leetcode.com/u/saanvi_garg/
samragyi.sharma.s64@kalvium.community	https://leetcode.com/u/samragyiCodes/
suhani.garg.s64@kalvium.community	https://leetcode.com/u/Suhani12-3/
tejas.singh.s64@kalvium.community	https://leetcode.com/u/lAFN3qMyQy/
`;

const MITADT_DATA = `
anant.sastrula.s72@kalvium.community	https://leetcode.com/u/sastrulaanant
avinash.sah.s72@kalvium.community	Avii_k - LeetCode Profile
bhumigaya.peswani.s72@kalvium.community	https://leetcode.com/u/Bhumigaya_Peswani/
heramb.inamke.s72@kalvium.community	https://leetcode.com/u/HerambInamke/
mallikarjun.hiremath.s72@kalvium.community	https://leetcode.com/u/LJI42jABEZ/
raphael.dalmeida.s72@kalvium.community	https://leetcode.com/u/Raph13600/
sripranathi.indupalli.s72@kalvium.community	https://leetcode.com/u/Sri_Pranathi/
udaybir.singh.s72@kalvium.community	https://leetcode.com/u/V3NOM9909/
aditya.nikam.s73@kalvium.community	https://leetcode.com/u/Aditya_9404/
akash.ramesh.s73@kalvium.community	https://leetcode.com/u/Akash_Ramesh_Kolhe/
avishkar.durgade.s73@kalvium.community	https://leetcode.com/u/2LJwBfvxf2/
naman.binu.s73@kalvium.community	https://leetcode.com/u/Naman1369/
nitin.dhake.s73@kalvium.community	https://leetcode.com/u/Dbvls042ya/
shriraj.jadhav.s73@kalvium.community	https://leetcode.com/u/shriraj1901/
shubham.padkonde.s73@kalvium.community	https://leetcode.com/u/12122005
`;

const KALVIUMDIRECT_DATA = `
aakash.j.s76@kalvium.community	https://leetcode.com/u/Aakash1106s/
abhinivesh.s.s76@kalvium.community	https://leetcode.com/u/Abhisa8888/
akarshana.saravanan.s76@kalvium.community	https://leetcode.com/u/akarsha3109/
akshad.b.s76@kalvium.community	https://leetcode.com/u/akshad204/
balaji.r.s76@kalvium.community	https://leetcode.com/u/balajirkb/
che.shahith.s76@kalvium.community	https://leetcode.com/u/cheshahith/
deva.harsheni.s76@kalvium.community	https://leetcode.com/u/deva_harsheni/
dharun.kumar.s76@kalvium.community	https://leetcode.com/u/DharunkumarG/
harish.b.s76@kalvium.community	https://leetcode.com/u/harishb2006/
jandy.y.s76@kalvium.community	https://leetcode.com/u/Jandy_Roach/
mohammed.razy.s76@kalvium.community	https://leetcode.com/u/R-azy/
nandhini.m.s76@kalvium.community	https://leetcode.com/u/nandz_04/
pawin.d.s76@kalvium.community	https://leetcode.com/u/rSlHfhAnFj/
sandanam.k.s76@kalvium.community	https://leetcode.com/u/Sandanam_K/
suba.dharshini.s76@kalvium.community	https://leetcode.com/u/Subadharshini05/
vigneshwaran.p.s76@kalvium.community	https://leetcode.com/u/Vigneshwaranp2006/
vishal.muthukumar.s76@kalvium.community	https://leetcode.com/u/1aTxd3SUL7/
`;

function parseData(data: string): { email: string; handle: string }[] {
  return data
    .trim()
    .split('\n')
    .map(line => {
      const [email, ...rest] = line.split('\t');
      const handle = extractHandle(rest.join('\t'));
      return { email: email.trim(), handle: handle ?? '' };
    })
    .filter(row => row.email && row.handle);
}

async function main() {
  const updates = [
    ...parseData(JECRC_DATA),
    ...parseData(MITADT_DATA),
    ...parseData(KALVIUMDIRECT_DATA),
  ];

  console.log(`Parsed ${updates.length} students with handles to update\n`);

  let updated = 0;
  let notFound = 0;
  let alreadySet = 0;

  for (const { email, handle } of updates) {
    const student = await prisma.student.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, leetcodeUsername: true },
    });

    if (!student) {
      console.log(`❌ Not found: ${email}`);
      notFound++;
      continue;
    }

    if (student.leetcodeUsername === handle) {
      console.log(`⏭️  Already set: ${student.name} → ${handle}`);
      alreadySet++;
      continue;
    }

    await prisma.student.update({
      where: { id: student.id },
      data: { leetcodeUsername: handle },
    });

    console.log(`✅ Updated: ${student.name} → ${handle}`);
    updated++;
  }

  console.log(`\n========== Summary ==========`);
  console.log(`Updated: ${updated}`);
  console.log(`Already set: ${alreadySet}`);
  console.log(`Not found: ${notFound}`);

  await prisma.$disconnect();
}

main().catch(console.error);
