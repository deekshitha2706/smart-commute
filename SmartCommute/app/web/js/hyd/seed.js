/* SmartCommute / Hyderabad — bundled seed gazetteer (offline fallback + instant autocomplete)
 *
 * IMPORTANT: this is a hand-compiled list of well-known Hyderabad places. Coordinates are approximate
 * (typically within a few hundred metres). It exists so search works instantly and offline. The complete
 * database comes from OpenStreetMap: the app downloads it in the background (db.js -> Overpass API) and
 * tools/build_hyderabad_db.py can pre-build it into data/hyderabad_osm.js.  OSM records replace seed records
 * with the same name, so accuracy improves automatically once the download has run.
 *
 * Row format:  [name, lat, lon, area, aliases(space-separated, optional), extra(optional)]
 */
(function (SC) {
  'use strict';
  const H = (SC.hyd = SC.hyd || {});
  const D = (H.seed = { version: '2026.10-seed', types: {} });
  const add = (t, rows) => { D.types[t] = (D.types[t] || []).concat(rows); };

  /* ------------------------------------------------------------------ localities */
  add('locality', [
    ['Banjara Hills', 17.4126, 78.4482, 'Hyderabad'], ['Jubilee Hills', 17.4325, 78.4072, 'Hyderabad'], ['Madhapur', 17.4486, 78.3908, 'Hyderabad'],
    ['Gachibowli', 17.4401, 78.3489, 'Hyderabad', 'gachi'], ['Kondapur', 17.4600, 78.3640, 'Hyderabad'], ['Hitech City', 17.4435, 78.3772, 'Hyderabad', 'hitec hi-tech hitech'],
    ['Kukatpally', 17.4948, 78.3996, 'Hyderabad', 'kphb kukatpalli'], ['Miyapur', 17.4969, 78.3590, 'Hyderabad'], ['Chandanagar', 17.4930, 78.3250, 'Hyderabad'],
    ['Lingampally', 17.4934, 78.3170, 'Hyderabad', 'lingampalli'], ['Begumpet', 17.4440, 78.4670, 'Hyderabad'], ['Secunderabad', 17.4399, 78.4983, 'Hyderabad', 'sec-bad secbad'],
    ['Ameerpet', 17.4375, 78.4483, 'Hyderabad', 'amirpet'], ['SR Nagar', 17.4418, 78.4412, 'Hyderabad', 'sr nagar sanjeeva reddy nagar'], ['Erragadda', 17.4570, 78.4330, 'Hyderabad'],
    ['Sanath Nagar', 17.4560, 78.4440, 'Hyderabad'], ['Panjagutta', 17.4256, 78.4520, 'Hyderabad', 'punjagutta'], ['Somajiguda', 17.4236, 78.4580, 'Hyderabad'],
    ['Khairatabad', 17.4108, 78.4600, 'Hyderabad'], ['Lakdikapul', 17.4045, 78.4640, 'Hyderabad', 'lakdi ka pul'], ['Nampally', 17.3920, 78.4690, 'Hyderabad'],
    ['Abids', 17.3910, 78.4740, 'Hyderabad'], ['Koti', 17.3850, 78.4800, 'Hyderabad'], ['Sultan Bazar', 17.3840, 78.4830, 'Hyderabad'],
    ['Charminar', 17.3616, 78.4747, 'Old City', 'char minar'], ['Mehdipatnam', 17.3950, 78.4400, 'Hyderabad', 'mehdipatnam'], ['Tolichowki', 17.4060, 78.4130, 'Hyderabad', 'toli chowki'],
    ['Attapur', 17.3680, 78.4290, 'Hyderabad'], ['Rajendranagar', 17.3230, 78.4040, 'Hyderabad'], ['Shamshabad', 17.2570, 78.4000, 'Rangareddy', 'rgia'],
    ['Narsingi', 17.3870, 78.3640, 'Hyderabad'], ['Manikonda', 17.4040, 78.3830, 'Hyderabad'], ['Financial District', 17.4180, 78.3420, 'Nanakramguda', 'fd nanakramguda'],
    ['Kokapet', 17.3940, 78.3320, 'Hyderabad'], ['Gandipet', 17.3890, 78.3130, 'Hyderabad'], ['Yousufguda', 17.4370, 78.4290, 'Hyderabad', 'yusufguda'],
    ['Srinagar Colony', 17.4210, 78.4350, 'Hyderabad'], ['Film Nagar', 17.4150, 78.4100, 'Hyderabad'], ['Shaikpet', 17.4060, 78.4100, 'Hyderabad'],
    ['Masab Tank', 17.4000, 78.4510, 'Hyderabad', 'masabtank'], ['Nanal Nagar', 17.3940, 78.4260, 'Hyderabad'], ['Langar Houz', 17.3750, 78.4250, 'Hyderabad', 'langar house'],
    ['Golconda', 17.3833, 78.4011, 'Hyderabad', 'golkonda'], ['Malakpet', 17.3750, 78.5000, 'Hyderabad'], ['Dilsukhnagar', 17.3688, 78.5247, 'Hyderabad', 'dsnr dilsukh nagar'],
    ['LB Nagar', 17.3457, 78.5522, 'Hyderabad', 'lb nagar l.b. nagar'], ['Vanasthalipuram', 17.3300, 78.5700, 'Hyderabad'], ['Hayathnagar', 17.3270, 78.6040, 'Hyderabad'],
    ['Nagole', 17.3910, 78.5610, 'Hyderabad'], ['Uppal', 17.4056, 78.5590, 'Hyderabad'], ['Habsiguda', 17.4170, 78.5360, 'Hyderabad'],
    ['Tarnaka', 17.4270, 78.5290, 'Hyderabad'], ['Mettuguda', 17.4330, 78.5130, 'Hyderabad'], ['Malkajgiri', 17.4560, 78.5300, 'Hyderabad'],
    ['Alwal', 17.5000, 78.5100, 'Hyderabad'], ['Bowenpally', 17.4720, 78.4800, 'Hyderabad', 'bowenpalli'], ['Kompally', 17.5400, 78.4870, 'Hyderabad'],
    ['Medchal', 17.6290, 78.4810, 'Medchal'], ['Quthbullapur', 17.5100, 78.4500, 'Hyderabad'], ['Jeedimetla', 17.5150, 78.4560, 'Hyderabad'],
    ['Balanagar', 17.4680, 78.4400, 'Hyderabad'], ['Moosapet', 17.4680, 78.4260, 'Hyderabad'], ['Bachupally', 17.5400, 78.3650, 'Hyderabad'],
    ['Nizampet', 17.5160, 78.3830, 'Hyderabad'], ['Pragathi Nagar', 17.5200, 78.3900, 'Hyderabad'], ['Himayatnagar', 17.4010, 78.4780, 'Hyderabad'],
    ['Basheerbagh', 17.3990, 78.4750, 'Hyderabad', 'bashir bagh'], ['Narayanguda', 17.3950, 78.4830, 'Hyderabad'], ['Kachiguda', 17.3900, 78.4930, 'Hyderabad', 'kacheguda'],
    ['Chaderghat', 17.3820, 78.4870, 'Hyderabad'], ['Saidabad', 17.3600, 78.5100, 'Hyderabad'], ['Santoshnagar', 17.3560, 78.5110, 'Hyderabad'],
    ['Chandrayangutta', 17.3350, 78.4800, 'Hyderabad'], ['Falaknuma', 17.3320, 78.4670, 'Hyderabad'], ['Bahadurpura', 17.3500, 78.4450, 'Hyderabad'],
    ['Madinaguda', 17.4980, 78.3470, 'Hyderabad'], ['Hafeezpet', 17.4860, 78.3550, 'Hyderabad'], ['Nallagandla', 17.4700, 78.3000, 'Hyderabad'],
    ['Tellapur', 17.4600, 78.2800, 'Hyderabad'], ['Patancheru', 17.5300, 78.2650, 'Sangareddy'], ['Ramachandrapuram', 17.5280, 78.3150, 'Hyderabad', 'rc puram'],
    ['Vijayanagar Colony', 17.3960, 78.4380, 'Hyderabad'], ['Marredpally', 17.4470, 78.5080, 'Hyderabad'], ['Trimulgherry', 17.4770, 78.5040, 'Hyderabad'],
    ['Bolarum', 17.5240, 78.5130, 'Hyderabad'], ['Sainikpuri', 17.4800, 78.5530, 'Hyderabad'], ['ECIL', 17.4700, 78.5700, 'Hyderabad', 'ecil x roads'],
    ['Kushaiguda', 17.4900, 78.5600, 'Hyderabad'], ['Mallapur', 17.4590, 78.5710, 'Hyderabad'], ['Boduppal', 17.4230, 78.5970, 'Hyderabad'],
    ['Peerzadiguda', 17.4050, 78.6100, 'Hyderabad'], ['Ghatkesar', 17.4400, 78.6860, 'Medchal'], ['Kothapet', 17.3680, 78.5500, 'Hyderabad'],
    ['Saroornagar', 17.3500, 78.5300, 'Hyderabad'], ['Gaddiannaram', 17.3680, 78.5360, 'Hyderabad'], ['Amberpet', 17.3990, 78.5130, 'Hyderabad'],
    ['Padmarao Nagar', 17.4330, 78.5000, 'Secunderabad'], ['Moula Ali', 17.4640, 78.5560, 'Hyderabad'], ['Nacharam', 17.4280, 78.5560, 'Hyderabad'],
    ['Kothaguda', 17.4615, 78.3640, 'Hyderabad'], ['Serilingampally', 17.4870, 78.3200, 'Hyderabad'], ['Moinabad', 17.2990, 78.2690, 'Rangareddy'],
    ['Old City', 17.3600, 78.4730, 'Hyderabad', 'old city purana shahar'], ['Tank Bund', 17.4260, 78.4750, 'Hyderabad'], ['Necklace Road', 17.4160, 78.4630, 'Hyderabad'],
    ['Santosh Nagar', 17.3560, 78.5110, 'Hyderabad'], ['Mir Alam Tank', 17.3480, 78.4540, 'Hyderabad'], ['Tarbund', 17.4530, 78.4930, 'Secunderabad'],
    ['Bhel', 17.5010, 78.3150, 'Hyderabad', 'bhel ramachandrapuram'], ['Allwyn Colony', 17.4890, 78.4000, 'Kukatpally'], ['Bandlaguda', 17.3220, 78.5100, 'Hyderabad'],
    ['Appa Junction', 17.3320, 78.3920, 'Rajendranagar'], ['Kismatpur', 17.3470, 78.3860, 'Rajendranagar'], ['Budvel', 17.3300, 78.4060, 'Rajendranagar'],
    ['Tukkuguda', 17.2400, 78.5100, 'Rangareddy'], ['Adibatla', 17.2360, 78.5800, 'Rangareddy'], ['Uppal Kalan', 17.4070, 78.5700, 'Hyderabad']
  ]);

  /* ------------------------------------------------------------------ colonies / residential layouts */
  add('colony', [
    ['KPHB Colony', 17.4850, 78.3997, 'Kukatpally', 'kphb kukatpally housing board'], ['Jubilee Hills Road No. 36', 17.4310, 78.4040, 'Jubilee Hills', 'road 36 road no 36'],
    ['Road No. 1 Banjara Hills', 17.4140, 78.4350, 'Banjara Hills', 'road 1 road no 1'], ['Road No. 12 Banjara Hills', 17.4160, 78.4420, 'Banjara Hills', 'road 12 road no 12'],
    ['Vengalrao Nagar', 17.4400, 78.4350, 'Yousufguda'], ['Srinivasa Nagar', 17.4390, 78.4330, 'Yousufguda'], ['Krishna Nagar', 17.4290, 78.4250, 'Jubilee Hills'],
    ['Madhura Nagar', 17.4390, 78.4400, 'Ameerpet'], ['Bharat Nagar', 17.4629, 78.4297, 'Moosapet'], ['Vivekananda Nagar Colony', 17.4880, 78.4150, 'Kukatpally'],
    ['Dr. A.S. Rao Nagar', 17.4780, 78.5600, 'ECIL', 'as rao nagar'], ['Gandhi Nagar', 17.4140, 78.4820, 'Hyderabad'], ['Chikkadpally', 17.4040, 78.4900, 'Hyderabad', 'chikkadpalli'],
    ['Vidyanagar', 17.4100, 78.5060, 'Hyderabad'], ['Ramanthapur', 17.4040, 78.5330, 'Hyderabad'], ['Sri Nagar Colony', 17.4210, 78.4350, 'Yousufguda'],
    ['Mythri Nagar', 17.4950, 78.3600, 'Miyapur'], ['Hydernagar', 17.4950, 78.3800, 'Kukatpally'], ['Prashanth Nagar', 17.4850, 78.4050, 'Kukatpally'],
    ['Kamala Prasanna Nagar', 17.4780, 78.4340, 'Balanagar'], ['Sri Ram Nagar Colony', 17.4590, 78.3730, 'Kondapur'], ['Raghavendra Colony', 17.4560, 78.3620, 'Kondapur'],
    ['Gayatri Nagar', 17.4400, 78.4400, 'Ameerpet'], ['Teachers Colony', 17.4300, 78.4180, 'Jubilee Hills'], ['Journalist Colony', 17.4230, 78.4020, 'Jubilee Hills'],
    ['Mayur Marg Colony', 17.4390, 78.4500, 'Begumpet'], ['Defence Colony', 17.4570, 78.5290, 'Sainikpuri'], ['Vijayapuri Colony', 17.4570, 78.5110, 'Malkajgiri'],
    ['Teacher\'s Colony Dilsukhnagar', 17.3700, 78.5250, 'Dilsukhnagar'], ['Kothapet Housing Board Colony', 17.3690, 78.5480, 'Kothapet']
  ]);

  /* ------------------------------------------------------------------ junctions */
  add('junction', [
    ['Jubilee Hills Check Post', 17.4311, 78.4108, 'Jubilee Hills', 'check post checkpost'], ['Panjagutta Junction', 17.4256, 78.4520, 'Panjagutta', 'punjagutta circle'],
    ['Paradise Junction', 17.4415, 78.4865, 'Secunderabad', 'paradise circle'], ['Secunderabad Clock Tower', 17.4395, 78.4985, 'Secunderabad', 'clock tower'],
    ['Tarnaka X Roads', 17.4270, 78.5290, 'Tarnaka', 'tarnaka cross roads'], ['Nampally Junction', 17.3920, 78.4700, 'Nampally'], ['Lakdikapul Junction', 17.4045, 78.4640, 'Lakdikapul'],
    ['Khairatabad Junction', 17.4110, 78.4610, 'Khairatabad', 'khairatabad flyover'], ['Masab Tank Junction', 17.3990, 78.4510, 'Masab Tank'], ['Mehdipatnam Junction', 17.3950, 78.4400, 'Mehdipatnam', 'mehdipatnam rythu bazar'],
    ['Tolichowki Junction', 17.4060, 78.4130, 'Tolichowki'], ['Gachibowli Junction', 17.4400, 78.3480, 'Gachibowli', 'gachibowli flyover'], ['Biodiversity Junction', 17.4260, 78.3590, 'Gachibowli'],
    ['Cyber Towers Junction', 17.4505, 78.3810, 'Madhapur'], ['Kondapur Junction', 17.4620, 78.3640, 'Kondapur'], ['Botanical Garden Junction', 17.4620, 78.3590, 'Kondapur'],
    ['Miyapur X Roads', 17.4968, 78.3586, 'Miyapur', 'miyapur cross roads'], ['JNTU Junction', 17.4935, 78.3910, 'Kukatpally', 'jntu'], ['Kukatpally Y Junction', 17.4845, 78.4120, 'Kukatpally', 'y junction ky junction'],
    ['Moosapet Junction', 17.4680, 78.4260, 'Moosapet'], ['Balanagar X Roads', 17.4720, 78.4330, 'Balanagar'], ['Erragadda Junction', 17.4560, 78.4350, 'Erragadda'],
    ['Ameerpet X Roads', 17.4375, 78.4483, 'Ameerpet', 'ameerpet cross roads'], ['Greenlands Junction', 17.4410, 78.4600, 'Begumpet', 'greenlands'], ['Somajiguda Circle', 17.4236, 78.4580, 'Somajiguda', 'raj bhavan road'],
    ['Liberty Junction', 17.4000, 78.4750, 'Himayatnagar', 'liberty'], ['Basheerbagh Junction', 17.3990, 78.4750, 'Basheerbagh'], ['Abids Circle', 17.3920, 78.4740, 'Abids', 'abids'],
    ['Koti Junction', 17.3850, 78.4800, 'Koti', 'koti x roads'], ['Chaderghat Junction', 17.3820, 78.4870, 'Chaderghat'], ['Malakpet Junction', 17.3750, 78.5000, 'Malakpet'],
    ['Dilsukhnagar Junction', 17.3688, 78.5247, 'Dilsukhnagar', 'dsnr'], ['LB Nagar X Roads', 17.3480, 78.5520, 'LB Nagar', 'lb nagar cross roads'], ['Uppal X Roads', 17.4010, 78.5590, 'Uppal'],
    ['Habsiguda X Roads', 17.4170, 78.5360, 'Habsiguda'], ['RTC X Roads', 17.4060, 78.4960, 'Musheerabad', 'rtc cross roads'], ['Afzalgunj Junction', 17.3780, 78.4750, 'Afzalgunj'],
    ['Falaknuma Junction', 17.3320, 78.4670, 'Falaknuma'], ['ECIL X Roads', 17.4730, 78.5700, 'ECIL'], ['Shamshabad X Roads', 17.2640, 78.4020, 'Shamshabad'],
    ['Hitec City Junction', 17.4440, 78.3770, 'Madhapur', 'hitec city x roads'], ['IKEA Junction', 17.4340, 78.3720, 'Raidurg'], ['Mindspace Junction', 17.4410, 78.3800, 'Madhapur'],
    ['Nanakramguda Junction', 17.4170, 78.3440, 'Financial District'], ['Narsingi Junction', 17.3870, 78.3640, 'Narsingi'], ['Rethibowli Junction', 17.3920, 78.4310, 'Mehdipatnam', 'rethi bowli'],
    ['Jubilee Hills Road No. 5 Junction', 17.4300, 78.4170, 'Jubilee Hills'], ['Film Nagar Junction', 17.4150, 78.4100, 'Jubilee Hills'], ['Secretariat Junction', 17.4072, 78.4733, 'Saifabad'],
    ['Madhapur Junction', 17.4430, 78.3920, 'Madhapur'], ['Begumpet Flyover', 17.4430, 78.4650, 'Begumpet'], ['Bowenpally X Roads', 17.4720, 78.4800, 'Bowenpally'],
    ['Suchitra Junction', 17.5000, 78.4800, 'Quthbullapur', 'suchitra x roads'], ['Kompally Junction', 17.5400, 78.4870, 'Kompally'], ['Alwal Junction', 17.5000, 78.5100, 'Alwal']
  ]);

  /* ------------------------------------------------------------------ landmarks */
  add('landmark', [
    ['Charminar', 17.3616, 78.4747, 'Old City', 'char minar'], ['Golconda Fort', 17.3833, 78.4011, 'Golconda', 'golkonda fort'], ['Hussain Sagar Lake', 17.4239, 78.4738, 'Hyderabad', 'hussainsagar tank bund lake'],
    ['Buddha Statue', 17.4156, 78.4747, 'Hussain Sagar', 'buddha'], ['Birla Mandir', 17.4062, 78.4691, 'Naubat Pahad'], ['Salar Jung Museum', 17.3713, 78.4804, 'Old City', 'salarjung'],
    ['Chowmahalla Palace', 17.3578, 78.4717, 'Old City', 'chowmohalla'], ['Mecca Masjid', 17.3604, 78.4736, 'Old City'], ['Qutb Shahi Tombs', 17.3943, 78.3946, 'Ibrahim Bagh'],
    ['Falaknuma Palace', 17.3314, 78.4672, 'Falaknuma', 'taj falaknuma'], ['Laad Bazaar', 17.3614, 78.4730, 'Old City', 'lad bazar'], ['Ramoji Film City', 17.2543, 78.6808, 'Abdullapurmet'],
    ['Nehru Zoological Park', 17.3490, 78.4510, 'Bahadurpura', 'zoo hyderabad zoo'], ['Lumbini Park', 17.4101, 78.4685, 'Hussain Sagar'], ['NTR Gardens', 17.4140, 78.4670, 'Necklace Road'],
    ['KBR National Park', 17.4190, 78.4290, 'Jubilee Hills', 'kbr park'], ['Durgam Cheruvu', 17.4330, 78.3920, 'Madhapur', 'secret lake'], ['Shilparamam', 17.4515, 78.3790, 'Madhapur'],
    ['Prasads IMAX', 17.4125, 78.4690, 'Necklace Road', 'prasad imax'], ['Telangana Secretariat', 17.4074, 78.4733, 'Saifabad', 'dr br ambedkar secretariat'], ['Telangana Assembly', 17.4008, 78.4698, 'Nampally', 'legislative assembly'],
    ['Raj Bhavan', 17.4155, 78.4570, 'Somajiguda'], ['HITEX Exhibition Centre', 17.4735, 78.3790, 'Madhapur', 'hitex'], ['Gachibowli Stadium', 17.4424, 78.3500, 'Gachibowli', 'gmc balayogi stadium'],
    ['Lal Bahadur Stadium', 17.3996, 78.4690, 'Fateh Maidan', 'lb stadium'], ['Rajiv Gandhi International Airport', 17.2403, 78.4294, 'Shamshabad', 'rgia hyderabad airport hyd airport'], ['Osmania University', 17.4120, 78.5290, 'Amberpet', 'ou'],
    ['Birla Science Museum', 17.4083, 78.4673, 'Naubat Pahad'], ['Paigah Tombs', 17.3550, 78.4780, 'Santoshnagar'], ['Chilkur Balaji Temple', 17.3930, 78.3000, 'Chilkur', 'visa balaji'],
    ['Peddamma Temple', 17.4310, 78.4020, 'Jubilee Hills'], ['Ujjaini Mahankali Temple', 17.4410, 78.4980, 'Secunderabad', 'mahankali'], ['Jagannath Temple Banjara Hills', 17.4190, 78.4350, 'Banjara Hills'],
    ['Eat Street', 17.4290, 78.4800, 'Necklace Road'], ['Sanjeevaiah Park', 17.4180, 78.4770, 'Hussain Sagar'], ['Indira Park', 17.4100, 78.4850, 'Domalguda'],
    ['Snow World', 17.4120, 78.4780, 'Hussain Sagar'], ['Mahavir Harina Vanasthali National Park', 17.3330, 78.5580, 'Vanasthalipuram'], ['Ananthagiri Hills Viewpoint', 17.3900, 78.4000, 'Hyderabad'],
    ['Charminar Pedestrian Plaza', 17.3620, 78.4750, 'Old City'], ['Taramati Baradari', 17.3750, 78.3830, 'Ibrahim Bagh'], ['Public Gardens Nampally', 17.4000, 78.4690, 'Nampally', 'state museum'],
    ['Inorbit Mall Ground', 17.4340, 78.3850, 'Madhapur'], ['Hyderabad Race Club', 17.3830, 78.4000, 'Malakpet'], ['People\'s Plaza', 17.4210, 78.4740, 'Necklace Road', 'peoples plaza'],
    ['Telangana Martyrs Memorial', 17.4120, 78.4640, 'Gun Park', 'gun park'], ['Ravindra Bharathi', 17.4120, 78.4600, 'Saifabad'], ['Shilpakala Vedika', 17.4505, 78.3815, 'Madhapur']
  ]);

  /* ------------------------------------------------------------------ metro stations (Hyderabad Metro) */
  const M = (line, rows) => rows.map((r) => [r[0] + ' Metro Station', r[1], r[2], line, (r[3] || '') + ' ' + r[0].toLowerCase() + ' metro', { line }]);
  add('metro', [].concat(
    M('Red Line (Miyapur – LB Nagar)', [
      ['Miyapur', 17.4968, 78.3586], ['JNTU College', 17.4936, 78.3917, 'jntu'], ['KPHB Colony', 17.4850, 78.3995, 'kphb'], ['Kukatpally', 17.4833, 78.4086],
      ['Balanagar', 17.4767, 78.4180], ['Moosapet', 17.4667, 78.4260], ['Bharat Nagar', 17.4629, 78.4297], ['Erragadda', 17.4560, 78.4350], ['ESI Hospital', 17.4520, 78.4385],
      ['S R Nagar', 17.4440, 78.4410, 'sr nagar'], ['Ameerpet', 17.4375, 78.4483], ['Punjagutta', 17.4275, 78.4515, 'panjagutta'], ['Irrum Manzil', 17.4190, 78.4530],
      ['Khairatabad', 17.4120, 78.4610], ['Lakdi Ka Pul', 17.4040, 78.4640, 'lakdikapul'], ['Assembly', 17.4000, 78.4700], ['Nampally', 17.3920, 78.4680],
      ['Gandhi Bhavan', 17.3880, 78.4720], ['Osmania Medical College', 17.3855, 78.4800], ['MG Bus Station', 17.3790, 78.4830, 'mgbs mahatma gandhi bus station'],
      ['Malakpet', 17.3750, 78.4960], ['New Market', 17.3745, 78.5035], ['Musarambagh', 17.3700, 78.5140], ['Dilsukhnagar', 17.3690, 78.5260], ['Chaitanyapuri', 17.3680, 78.5370],
      ['Victoria Memorial', 17.3650, 78.5440], ['LB Nagar', 17.3470, 78.5520]]),
    M('Blue Line (Nagole – Raidurg)', [
      ['Nagole', 17.3910, 78.5600], ['Uppal', 17.4000, 78.5590], ['Stadium', 17.4040, 78.5480], ['NGRI', 17.4110, 78.5410], ['Habsiguda', 17.4170, 78.5330], ['Tarnaka', 17.4260, 78.5270],
      ['Mettuguda', 17.4330, 78.5160], ['Secunderabad East', 17.4390, 78.5040], ['Parade Grounds', 17.4430, 78.4950], ['Paradise', 17.4415, 78.4865], ['Rasoolpura', 17.4440, 78.4790],
      ['Prakash Nagar', 17.4437, 78.4715], ['Begumpet', 17.4430, 78.4650], ['Madhura Nagar', 17.4390, 78.4400], ['Yousufguda', 17.4340, 78.4260],
      ['Jubilee Hills Road No 5', 17.4300, 78.4170, 'road no 5'], ['Jubilee Hills Check Post', 17.4311, 78.4108], ['Peddamma Temple', 17.4310, 78.4020],
      ['Madhapur', 17.4410, 78.3940], ['Durgam Cheruvu', 17.4360, 78.3880], ['HITEC City', 17.4445, 78.3790, 'hitech city hitec'], ['Raidurg', 17.4450, 78.3720, 'raidurgam']]),
    M('Green Line (JBS – MGBS)', [
      ['JBS Parade Ground', 17.4455, 78.4970, 'jbs jubilee bus station'], ['Secunderabad West', 17.4350, 78.4990], ['Gandhi Hospital', 17.4190, 78.4980],
      ['Musheerabad', 17.4110, 78.4980], ['RTC X Roads', 17.4060, 78.4960], ['Chikkadpally', 17.4040, 78.4900], ['Narayanguda', 17.3950, 78.4830], ['Sultan Bazar', 17.3840, 78.4830]])
  ));

  /* ------------------------------------------------------------------ railway stations (long-distance + MMTS) */
  add('railway', [
    ['Secunderabad Junction Railway Station', 17.4337, 78.5011, 'Secunderabad', 'secunderabad station sc scr'], ['Hyderabad Deccan Railway Station (Nampally)', 17.3893, 78.4694, 'Nampally', 'nampally station hyderabad deccan hyb'],
    ['Kacheguda Railway Station', 17.3858, 78.4970, 'Kachiguda', 'kacheguda station kcg'], ['Begumpet Railway Station', 17.4440, 78.4690, 'Begumpet', 'begumpet station'],
    ['Lingampally Railway Station', 17.4935, 78.3170, 'Lingampally', 'lingampalli station lpi'], ['Hitec City MMTS Station', 17.4510, 78.3770, 'Madhapur', 'hitec city station mmts'],
    ['Vidyanagar Railway Station', 17.4000, 78.5060, 'Vidyanagar'], ['Malkajgiri Railway Station', 17.4520, 78.5300, 'Malkajgiri'], ['Falaknuma Railway Station', 17.3330, 78.4640, 'Falaknuma'],
    ['Cherlapalli Railway Station', 17.4640, 78.5880, 'Cherlapalli'], ['Bolarum Railway Station', 17.5160, 78.5200, 'Bolarum'], ['Sitaphalmandi Railway Station', 17.4350, 78.5120, 'Sitaphalmandi'],
    ['Yakutpura Railway Station', 17.3580, 78.4890, 'Yakutpura'], ['Dabirpura Railway Station', 17.3640, 78.4980, 'Dabirpura'], ['Lakdikapul MMTS Station', 17.4040, 78.4640, 'Lakdikapul'],
    ['Khairatabad MMTS Station', 17.4130, 78.4620, 'Khairatabad'], ['Necklace Road MMTS Station', 17.4130, 78.4630, 'Necklace Road'], ['Hafizpet MMTS Station', 17.4890, 78.3600, 'Hafeezpet'],
    ['Borabanda MMTS Station', 17.4500, 78.4150, 'Borabanda'], ['Jamia Osmania Railway Station', 17.3940, 78.5010, 'Jamia Osmania'], ['Moula Ali Railway Station', 17.4640, 78.5560, 'Moula Ali'],
    ['Sanath Nagar Railway Station', 17.4560, 78.4430, 'Sanath Nagar'], ['Ramanthapur MMTS', 17.4040, 78.5330, 'Ramanthapur'], ['Chandanagar Railway Station', 17.4930, 78.3250, 'Chandanagar']
  ]);

  add('airport', [['Rajiv Gandhi International Airport (HYD)', 17.2403, 78.4294, 'Shamshabad', 'rgia hyderabad airport hyd airport shamshabad airport']]);

  /* ------------------------------------------------------------------ bus stations / major TSRTC stops */
  const B = (rows) => rows.map((r) => [r[0], r[1], r[2], r[3] || 'Hyderabad', 'tsrtc tgsrtc bus ' + (r[4] || ''), { opr: 'TSRTC' }]);
  add('bus_stop', B([
    ['Mahatma Gandhi Bus Station (MGBS)', 17.3787, 78.4833, 'Imlibun', 'mgbs imlibun'], ['Jubilee Bus Station (JBS)', 17.4455, 78.4970, 'Secunderabad', 'jbs'],
    ['Secunderabad Railway Station Bus Stop', 17.4320, 78.5000, 'Secunderabad'], ['Koti Bus Stop', 17.3860, 78.4810, 'Koti', 'koti womens college'],
    ['Kukatpally Bus Stop', 17.4870, 78.4120, 'Kukatpally', 'kukatpally y junction'], ['Miyapur Bus Depot', 17.4970, 78.3590, 'Miyapur'], ['Mehdipatnam Bus Stop', 17.3960, 78.4390, 'Mehdipatnam', 'mehdipatnam bus station'],
    ['LB Nagar Bus Stop', 17.3480, 78.5530, 'LB Nagar', 'lb nagar bus station'], ['Dilsukhnagar Bus Stop', 17.3690, 78.5250, 'Dilsukhnagar'], ['Uppal Bus Stop', 17.4010, 78.5600, 'Uppal', 'uppal x roads'],
    ['Charminar Bus Stop', 17.3640, 78.4730, 'Old City'], ['Afzalgunj Bus Stop', 17.3790, 78.4770, 'Afzalgunj'], ['Ameerpet Bus Stop', 17.4370, 78.4470, 'Ameerpet'],
    ['Madhapur Bus Stop', 17.4480, 78.3810, 'Madhapur', 'hitech city bus stop'], ['Gachibowli Bus Stop', 17.4400, 78.3470, 'Gachibowli'], ['Lingampally Bus Stop', 17.4930, 78.3170, 'Lingampally'],
    ['Rethibowli Bus Stop', 17.3920, 78.4310, 'Rethibowli'], ['Jubilee Hills Check Post Bus Stop', 17.4300, 78.4090, 'Jubilee Hills'], ['ECIL X Roads Bus Stop', 17.4730, 78.5700, 'ECIL'],
    ['Kondapur Bus Stop', 17.4620, 78.3660, 'Kondapur'], ['Chandanagar Bus Stop', 17.4930, 78.3250, 'Chandanagar'], ['Patancheru Bus Station', 17.5280, 78.2640, 'Patancheru'],
    ['RGIA Airport Bus Stop (Pushpak)', 17.2430, 78.4290, 'Shamshabad', 'pushpak airport'], ['Paradise Bus Stop', 17.4410, 78.4870, 'Paradise'], ['Tarnaka Bus Stop', 17.4270, 78.5290, 'Tarnaka'],
    ['Nampally Bus Stop', 17.3920, 78.4700, 'Nampally'], ['Lakdikapul Bus Stop', 17.4045, 78.4640, 'Lakdikapul'], ['Panjagutta Bus Stop', 17.4256, 78.4520, 'Panjagutta'],
    ['Begumpet Bus Stop', 17.4430, 78.4650, 'Begumpet'], ['Financial District Bus Stop', 17.4180, 78.3430, 'Nanakramguda', 'fd bus stop'], ['Kompally Bus Stop', 17.5400, 78.4870, 'Kompally']
  ]));

  /* ------------------------------------------------------------------ colleges / universities */
  add('college', [
    ['Osmania University', 17.4120, 78.5290, 'Amberpet', 'ou'], ['JNTU Hyderabad', 17.4932, 78.3914, 'Kukatpally', 'jntuh jntu'], ['International Institute of Information Technology (IIIT-H)', 17.4455, 78.3489, 'Gachibowli', 'iiit iiith'],
    ['University of Hyderabad', 17.4600, 78.3320, 'Gachibowli', 'uoh hcu central university'], ['Indian School of Business (ISB)', 17.4333, 78.3400, 'Gachibowli', 'isb'], ['CBIT (Chaitanya Bharathi Institute of Technology)', 17.3906, 78.3180, 'Gandipet', 'cbit'],
    ['Osmania Medical College', 17.3860, 78.4790, 'Koti', 'omc'], ['Gandhi Medical College', 17.4190, 78.4985, 'Secunderabad'], ['NIMS (Nizam\'s Institute of Medical Sciences)', 17.4220, 78.4520, 'Panjagutta', 'nims'],
    ['Nizam College', 17.3990, 78.4730, 'Basheerbagh'], ['St. Francis College for Women', 17.4290, 78.4560, 'Begumpet', 'st francis'], ['VNR Vignana Jyothi Institute (VNRVJIET)', 17.5400, 78.3830, 'Bachupally', 'vnr vjiet'],
    ['GRIET (Gokaraju Rangaraju Institute)', 17.5410, 78.3830, 'Bachupally', 'griet'], ['MGIT (Mahatma Gandhi Institute of Technology)', 17.3890, 78.3200, 'Gandipet', 'mgit'], ['Vasavi College of Engineering', 17.3800, 78.4010, 'Ibrahimbagh', 'vasavi'],
    ['Keshav Memorial Institute', 17.3960, 78.4830, 'Narayanguda', 'kmit'], ['Sreenidhi Institute of Science and Technology', 17.4400, 78.6800, 'Ghatkesar', 'snist sreenidhi'], ['CVR College of Engineering', 17.3290, 78.5690, 'Vanasthalipuram', 'cvr'],
    ['Anurag University', 17.4180, 78.6320, 'Ghatkesar'], ['MVSR Engineering College', 17.3270, 78.4720, 'Nadergul', 'mvsr'], ['BITS Pilani Hyderabad Campus', 17.5450, 78.5700, 'Shamirpet', 'bits'],
    ['NALSAR University of Law', 17.5700, 78.5780, 'Shamirpet', 'nalsar'], ['Maulana Azad National Urdu University (MANUU)', 17.4440, 78.3150, 'Gachibowli', 'manuu'], ['Methodist College of Engineering', 17.3830, 78.4730, 'Abids'],
    ['Sardar Patel College', 17.4400, 78.4980, 'Secunderabad'], ['Loyola Academy', 17.4890, 78.5430, 'Alwal'], ['St. Ann\'s College', 17.4390, 78.5050, 'Mehdipatnam'],
    ['Telangana University of Health Sciences', 17.4110, 78.4600, 'Warangal Road'], ['National Institute of Nutrition', 17.4160, 78.5430, 'Tarnaka', 'nin'], ['Hyderabad Institute of Technology and Management', 17.5900, 78.4300, 'Medchal']
  ]);

  /* ------------------------------------------------------------------ well-known schools */
  add('school', [
    ['Hyderabad Public School', 17.4445, 78.4630, 'Begumpet', 'hps'], ['Delhi Public School Nacharam', 17.4160, 78.5560, 'Nacharam', 'dps nacharam'], ['Oakridge International School', 17.4480, 78.3470, 'Gachibowli', 'oakridge'],
    ['Chirec International School', 17.4640, 78.3600, 'Kondapur', 'chirec'], ['Meridian School', 17.4130, 78.4350, 'Banjara Hills'], ['St. George\'s Grammar School', 17.3920, 78.4730, 'Abids', 'st georges'],
    ['All Saints High School', 17.3980, 78.4690, 'Hyderabad'], ['Nasr School', 17.4100, 78.4600, 'Khairatabad'], ['Bharatiya Vidya Bhavan Public School', 17.4190, 78.4300, 'Jubilee Hills', 'bvb'],
    ['Delhi Public School Hyderabad', 17.4440, 78.3790, 'Madhapur', 'dps madhapur'], ['Silver Oaks International School', 17.4960, 78.3280, 'Bachupally'], ['Glendale Academy', 17.3330, 78.4010, 'Rajendranagar'],
    ['Sancta Maria International School', 17.4230, 78.3550, 'Gachibowli'], ['Johnson Grammar School', 17.4000, 78.4400, 'Mehdipatnam'], ['Little Flower High School', 17.3800, 78.4800, 'Koti']
  ]);

  /* ------------------------------------------------------------------ hospitals */
  add('hospital', [
    ['NIMS Hospital', 17.4220, 78.4520, 'Punjagutta', 'nizams institute of medical sciences'], ['Osmania General Hospital', 17.3720, 78.4740, 'Afzalgunj', 'ogh'], ['Gandhi Hospital', 17.4190, 78.4980, 'Musheerabad'],
    ['Yashoda Hospital Somajiguda', 17.4250, 78.4580, 'Somajiguda'], ['Apollo Hospitals Jubilee Hills', 17.4180, 78.4110, 'Jubilee Hills', 'apollo'], ['KIMS Hospital Secunderabad', 17.4430, 78.4890, 'Secunderabad', 'kims'],
    ['CARE Hospitals Banjara Hills', 17.4130, 78.4440, 'Banjara Hills', 'care hospital'], ['Continental Hospitals', 17.4180, 78.3400, 'Nanakramguda'], ['AIG Hospitals', 17.4280, 78.3555, 'Gachibowli', 'asian institute of gastroenterology'],
    ['Niloufer Hospital', 17.4050, 78.4620, 'Lakdikapul'], ['Sunshine Hospitals', 17.4400, 78.4860, 'Paradise'], ['Medicover Hospitals Hitec City', 17.4510, 78.3830, 'Madhapur'],
    ['Star Hospitals', 17.4260, 78.4430, 'Banjara Hills'], ['Rainbow Children\'s Hospital', 17.4170, 78.4440, 'Banjara Hills'], ['Fever Hospital', 17.4010, 78.4890, 'Nallakunta'],
    ['Sarojini Devi Eye Hospital', 17.3950, 78.4350, 'Mehdipatnam'], ['LV Prasad Eye Institute', 17.4160, 78.4360, 'Banjara Hills', 'lvpei'], ['MNJ Institute of Oncology', 17.4040, 78.4580, 'Lakdikapul', 'mnj cancer'],
    ['ESI Hospital Sanathnagar', 17.4510, 78.4390, 'Sanath Nagar'], ['Virinchi Hospitals', 17.4160, 78.4430, 'Banjara Hills'], ['Aster Prime Hospital', 17.4350, 78.4470, 'Ameerpet'],
    ['Citizens Specialty Hospital', 17.4500, 78.3000, 'Nallagandla'], ['Maxcure Hospitals', 17.4410, 78.3790, 'Madhapur'], ['Kamineni Hospitals LB Nagar', 17.3480, 78.5500, 'LB Nagar'],
    ['Krishna Institute of Medical Sciences Kondapur', 17.4620, 78.3640, 'Kondapur'], ['Sai Sudha Hospital', 17.3700, 78.5250, 'Dilsukhnagar'], ['Ankura Hospital KPHB', 17.4860, 78.3990, 'KPHB'],
    ['Lotus Hospital Lakdikapul', 17.4050, 78.4630, 'Lakdikapul'], ['Princess Esra Hospital', 17.3600, 78.4730, 'Old City'], ['Omega Hospitals Banjara Hills', 17.4230, 78.4450, 'Banjara Hills'],
    ['Medicover Woman and Child Hospital Madhapur', 17.4440, 78.3880, 'Madhapur'], ['Basavatarakam Indo-American Cancer Hospital', 17.4120, 78.4120, 'Banjara Hills', 'bibicancer'], ['Mediciti Hospital', 17.5020, 78.5100, 'Alwal']
  ]);

  /* ------------------------------------------------------------------ IT parks */
  add('it_park', [
    ['Cyber Towers (HITEC City)', 17.4505, 78.3809, 'Madhapur', 'cyber towers'], ['Mindspace IT Park', 17.4410, 78.3790, 'Madhapur', 'raheja mindspace'], ['Hyderabad Knowledge City', 17.4410, 78.3770, 'Raidurg', 'knowledge city'],
    ['Cyber Gateway', 17.4500, 78.3800, 'Madhapur'], ['Waverock', 17.4150, 78.3440, 'Nanakramguda', 'wave rock'], ['Q City', 17.4160, 78.3450, 'Gachibowli'], ['DLF Cyber City', 17.4180, 78.3440, 'Gachibowli', 'dlf'],
    ['Salarpuria Sattva Knowledge City', 17.4260, 78.3770, 'Madhapur'], ['Phoenix IT Park', 17.4350, 78.3850, 'Madhapur'], ['My Home Hub', 17.4440, 78.3750, 'Madhapur'], ['My Home Twitza', 17.4260, 78.3380, 'Gachibowli'],
    ['Wipro Campus Gopanpally', 17.4440, 78.3070, 'Gopanpally', 'wipro'], ['Microsoft India Development Centre', 17.4270, 78.3410, 'Gachibowli', 'microsoft idc'], ['Amazon Hyderabad Campus', 17.4130, 78.3440, 'Nanakramguda', 'amazon'],
    ['Infosys Pocharam Campus', 17.4300, 78.6360, 'Pocharam', 'infosys'], ['TCS Synergy Park', 17.4190, 78.3390, 'Gachibowli', 'tcs'], ['Deccan Park', 17.4430, 78.3880, 'Madhapur'], ['Lanco Hills', 17.3990, 78.3880, 'Manikonda', 'lanco'],
    ['Divyasree Trinity', 17.4400, 78.3830, 'Madhapur'], ['Google Hyderabad', 17.4170, 78.3400, 'Gachibowli', 'google'], ['Genpact Hyderabad', 17.4260, 78.3620, 'Gachibowli'], ['HSBC Hyderabad Campus', 17.4240, 78.3560, 'Gachibowli', 'hsbc'],
    ['ICICI Knowledge Park', 17.5900, 78.5500, 'Genome Valley', 'genome valley'], ['Raheja IT Park Madhapur', 17.4400, 78.3800, 'Madhapur'],
    ['Vamsiram Jyothi', 17.4300, 78.3600, 'Gachibowli'], ['Ascendas IT Park', 17.4410, 78.3840, 'Madhapur']
  ]);

  /* ------------------------------------------------------------------ government offices */
  add('gov', [
    ['Telangana State Secretariat', 17.4074, 78.4733, 'Saifabad', 'secretariat'], ['Telangana Legislative Assembly', 17.4008, 78.4698, 'Nampally', 'assembly'], ['Raj Bhavan Hyderabad', 17.4155, 78.4570, 'Somajiguda'],
    ['GHMC Head Office', 17.3930, 78.4710, 'Tank Bund', 'ghmc greater hyderabad municipal corporation'], ['Telangana High Court', 17.3260, 78.4000, 'Rajendranagar', 'high court'], ['Collectorate Hyderabad', 17.3930, 78.4700, 'Nampally', 'collector office'],
    ['Telangana Police DGP Office', 17.4047, 78.4630, 'Lakdikapul', 'dgp police headquarters'], ['Regional Passport Office Ameerpet', 17.4340, 78.4440, 'Ameerpet', 'passport'], ['Income Tax Towers', 17.3990, 78.4740, 'Basheerbagh', 'it towers'],
    ['HMWSSB Head Office', 17.4100, 78.4590, 'Khairatabad', 'water board jal mandali'], ['HMDA Office', 17.4370, 78.4460, 'Ameerpet', 'hmda swarna jayanthi'], ['RTA Office Khairatabad', 17.4120, 78.4600, 'Khairatabad', 'rto transport'],
    ['Praja Bhavan', 17.4350, 78.4560, 'Begumpet', 'pragathi bhavan'], ['Telangana Bhavan', 17.4290, 78.4560, 'Begumpet'], ['BSNL Bhavan', 17.3990, 78.4770, 'Abids', 'bsnl'], ['Sanjeeva Reddy Nagar Post Office', 17.4430, 78.4420, 'SR Nagar', 'post office'],
    ['Telangana State Road Transport Corporation HQ', 17.3880, 78.4830, 'Musheerabad', 'tsrtc bhavan'], ['Charminar Police Station', 17.3620, 78.4740, 'Old City', 'police'], ['Hyderabad Metro Rail Bhavan', 17.4010, 78.4660, 'Begumpet', 'hmrl metro rail office']
  ]);

  /* ------------------------------------------------------------------ shopping malls */
  add('mall', [
    ['Inorbit Mall Hyderabad', 17.4350, 78.3830, 'Madhapur', 'inorbit'], ['Forum Sujana Mall', 17.4850, 78.4010, 'Kukatpally', 'forum mall nexus hyderabad'], ['Sarath City Capital Mall', 17.4600, 78.3640, 'Kondapur', 'sarath city'],
    ['GVK One Mall', 17.4180, 78.4490, 'Banjara Hills', 'gvk'], ['City Centre Mall', 17.4150, 78.4450, 'Banjara Hills', 'city center'], ['Hyderabad Central Mall', 17.4250, 78.4510, 'Panjagutta', 'central'],
    ['Manjeera Trinity Mall', 17.4890, 78.3950, 'KPHB', 'manjeera mall'], ['Next Galleria Mall', 17.4270, 78.4500, 'Panjagutta', 'galleria'], ['IKEA Hyderabad', 17.4340, 78.3720, 'Raidurg', 'ikea'],
    ['Lulu Mall Hyderabad', 17.4840, 78.4080, 'Kukatpally', 'lulu'], ['Mantri Square', 17.4430, 78.3780, 'Hitec City'], ['Prasads Multiplex', 17.4125, 78.4690, 'Necklace Road', 'prasads'],
    ['Mall at Gachibowli (Preston Prime)', 17.4390, 78.3490, 'Gachibowli', 'preston prime'], ['Manjeera Mall Kukatpally', 17.4900, 78.4000, 'Kukatpally'], ['Hyderabad Next Mall', 17.4370, 78.4480, 'Ameerpet'],
    ['Pista House Mall Road', 17.3600, 78.4730, 'Charminar'], ['CCPL Mall', 17.4380, 78.3840, 'Madhapur'], ['Shoppers Stop Banjara Hills', 17.4130, 78.4450, 'Banjara Hills'],
    ['Westside DLF Cyber City', 17.4180, 78.3450, 'Gachibowli'], ['Sri Chaitanya Mall', 17.3700, 78.5250, 'Dilsukhnagar'], ['Vijetha Super Market Mall Ameerpet', 17.4360, 78.4460, 'Ameerpet']
  ]);

  /* flatten for the DB engine */
  D.count = Object.keys(D.types).reduce((n, k) => n + D.types[k].length, 0);
})(window.SC = window.SC || {});
