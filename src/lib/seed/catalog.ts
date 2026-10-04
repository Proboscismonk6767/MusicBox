// Seed catalogue. Track format: "Title|m:ss[|feat a;feat b][|E]" (E = explicit).
// Durations are approximate. Artwork is filled by `npm run artwork` (iTunes
// Search API) when available; otherwise covers are generated from `palette`.

export interface SeedArtist {
  name: string;
  genres: string[];
  members?: string[];
  bio: string;
}

export interface SeedAlbum {
  artist: string;
  title: string;
  date: string;
  label: string;
  genres: string[];
  palette: [string, string, string];
  pattern: number;
  producers: string[];
  writers?: string[];
  tracks: string[];
}

export const SEED_ARTISTS: SeedArtist[] = [
  { name: "Frank Ocean", genres: ["Alternative R&B", "R&B"], bio: "Singer, songwriter and producer whose sparse, diaristic records reshaped modern R&B." },
  { name: "Radiohead", genres: ["Alternative Rock", "Art Rock", "Electronic"], members: ["Thom Yorke", "Jonny Greenwood", "Ed O'Brien", "Colin Greenwood", "Philip Selway"], bio: "Oxfordshire five-piece endlessly negotiating between guitars and machines." },
  { name: "Kendrick Lamar", genres: ["Hip-Hop", "Conscious Hip-Hop"], bio: "Compton rapper and conceptual album-maker." },
  { name: "Kanye West", genres: ["Hip-Hop"], bio: "Producer and rapper behind some of the most maximal records of the 2000s and 2010s." },
  { name: "Tame Impala", genres: ["Psychedelic Pop", "Neo-Psychedelia"], members: ["Kevin Parker"], bio: "Kevin Parker's one-man psychedelic project." },
  { name: "Beach House", genres: ["Dream Pop"], members: ["Victoria Legrand", "Alex Scally"], bio: "Baltimore duo making slow, glowing dream pop." },
  { name: "Mitski", genres: ["Indie Rock", "Art Pop"], bio: "Songwriter of precise, devastating miniatures." },
  { name: "Arctic Monkeys", genres: ["Indie Rock", "Alternative Rock"], members: ["Alex Turner", "Jamie Cook", "Nick O'Malley", "Matt Helders"], bio: "Sheffield band that went from garage rock to lounge noir." },
  { name: "SZA", genres: ["Alternative R&B", "R&B"], bio: "Singer whose confessional R&B defined a generation of breakup songs." },
  { name: "Daft Punk", genres: ["Electronic", "French House"], members: ["Thomas Bangalter", "Guy-Manuel de Homem-Christo"], bio: "Parisian robots who made dance music feel cinematic." },
  { name: "My Bloody Valentine", genres: ["Shoegaze", "Noise Pop"], members: ["Kevin Shields", "Bilinda Butcher", "Colm Ó Cíosóig", "Debbie Googe"], bio: "The band that made a wall of sound feel like weather." },
  { name: "Fleetwood Mac", genres: ["Soft Rock", "Rock"], members: ["Stevie Nicks", "Lindsey Buckingham", "Christine McVie", "John McVie", "Mick Fleetwood"], bio: "Rock's most famous emotional pressure cooker." },
  { name: "Bon Iver", genres: ["Indie Folk"], members: ["Justin Vernon"], bio: "Justin Vernon's project, born in a Wisconsin cabin." },
  { name: "Miles Davis", genres: ["Jazz", "Modal Jazz"], bio: "Trumpeter who reinvented jazz at least five times." },
  { name: "Phoebe Bridgers", genres: ["Indie Folk", "Indie Rock"], bio: "LA songwriter with a gift for funny, apocalyptic sadness." },
  { name: "Tyler, The Creator", genres: ["Hip-Hop", "Neo-Soul"], bio: "Rapper, producer and auteur." },
  { name: "Charli xcx", genres: ["Pop", "Hyperpop", "Electronic"], bio: "Pop futurist and club-music obsessive." },
  { name: "The Strokes", genres: ["Indie Rock", "Garage Rock"], members: ["Julian Casablancas", "Nick Valensi", "Albert Hammond Jr.", "Nikolai Fraiture", "Fabrizio Moretti"], bio: "New York band that made indie rock cool again in 2001." },
  { name: "Aphex Twin", genres: ["Electronic", "Ambient", "IDM"], members: ["Richard D. James"], bio: "Richard D. James — Cornish electronic mischief-maker." },
  { name: "Slowdive", genres: ["Shoegaze", "Dream Pop"], members: ["Neil Halstead", "Rachel Goswell", "Christian Savill", "Nick Chaplin", "Simon Scott"], bio: "Reading shoegazers whose reputation grew enormously after they split." },
  { name: "Lana Del Rey", genres: ["Baroque Pop", "Pop"], bio: "Cinematic Americana-noir pop, narrated in a slow, smoky croon." },
  { name: "The Weeknd", genres: ["Synthpop", "Alternative R&B"], bio: "Toronto singer who traded woozy mixtapes for stadium-size synth pop." },
  { name: "Childish Gambino", genres: ["Funk", "Psychedelic Soul"], bio: "Donald Glover's musical alter ego, from rap mixtapes to 70s-style funk." },
  { name: "Travis Scott", genres: ["Hip-Hop", "Trap"], bio: "Houston rapper and producer who builds records like theme-park rides." },
  { name: "Joy Division", genres: ["Post-Punk", "Gothic Rock"], members: ["Ian Curtis", "Bernard Sumner", "Peter Hook", "Stephen Morris"], bio: "Manchester post-punk pioneers with a sound as cold and wide as an empty warehouse." },
  { name: "The Cure", genres: ["Gothic Rock", "Alternative Rock"], members: ["Robert Smith"], bio: "Robert Smith's band, equally fluent in gloom and giddy pop." },
  { name: "Pink Floyd", genres: ["Progressive Rock", "Psychedelic Rock"], members: ["Roger Waters", "David Gilmour", "Richard Wright", "Nick Mason"], bio: "Concept-album architects of spacious, studio-built rock." },
  { name: "David Bowie", genres: ["Glam Rock", "Art Rock"], bio: "Shape-shifting songwriter who treated every album as a new character." },
  { name: "Nirvana", genres: ["Grunge", "Alternative Rock"], members: ["Kurt Cobain", "Krist Novoselic", "Dave Grohl"], bio: "Seattle trio that dragged underground rock into the mainstream." },
  { name: "Björk", genres: ["Art Pop", "Electronic"], bio: "Icelandic singer who bends pop, strings and beats into something strange and tender." },
  { name: "Portishead", genres: ["Trip Hop"], members: ["Beth Gibbons", "Geoff Barrow", "Adrian Utley"], bio: "Bristol trio making noir film scores for films that don't exist." },
  { name: "Massive Attack", genres: ["Trip Hop", "Electronic"], members: ["Robert Del Naja", "Grant Marshall"], bio: "Bristol collective that gave the 90s its late-night soundtrack." },
  { name: "Joni Mitchell", genres: ["Folk", "Singer-Songwriter"], bio: "Canadian songwriter whose open-tuned confessionals set the bar for the form." },
  { name: "Nick Drake", genres: ["Folk", "Chamber Folk"], bio: "Hushed English folk singer whose three albums found their audience decades late." },
  { name: "Sufjan Stevens", genres: ["Indie Folk", "Chamber Pop"], bio: "Multi-instrumentalist with a taste for the grand, the small and the devastating." },
  { name: "Lorde", genres: ["Art Pop", "Electropop"], bio: "New Zealand pop songwriter with a gift for the bittersweet after-party." },
  { name: "Lauryn Hill", genres: ["Neo-Soul", "Hip-Hop"], bio: "Singer and rapper whose one solo studio album became a landmark." },
  { name: "D'Angelo", genres: ["Neo-Soul", "Funk"], bio: "Virginia-born neo-soul auteur famed for loose, slow-burning grooves." },
  { name: "Mac Miller", genres: ["Hip-Hop", "Jazz Rap"], bio: "Pittsburgh rapper-producer who grew into a warm, searching songwriter." },
  { name: "Gorillaz", genres: ["Alternative Rock", "Electronic"], members: ["Damon Albarn", "Jamie Hewlett"], bio: "Damon Albarn's cartoon band and its ever-rotating guest list." },
  { name: "LCD Soundsystem", genres: ["Dance-Punk", "Electronic"], members: ["James Murphy"], bio: "James Murphy's dance-punk project, equal parts disco and neurosis." },
  { name: "The Smiths", genres: ["Indie Rock", "Jangle Pop"], members: ["Morrissey", "Johnny Marr", "Andy Rourke", "Mike Joyce"], bio: "Manchester band pairing Marr's guitars with Morrissey's wit and woe." },
  { name: "Talking Heads", genres: ["New Wave", "Art Rock"], members: ["David Byrne", "Tina Weymouth", "Chris Frantz", "Jerry Harrison"], bio: "New York art-school band that made nervy, funky, endlessly inventive pop." },
  { name: "The Velvet Underground", genres: ["Art Rock", "Experimental Rock"], members: ["Lou Reed", "John Cale", "Sterling Morrison", "Maureen Tucker"], bio: "Warhol-era New York band whose cult outweighed its sales a thousand to one." },
  { name: "FKA twigs", genres: ["Art Pop", "Experimental R&B"], bio: "Dancer and producer building sensual, fractured pop." },
  { name: "Billie Eilish", genres: ["Electropop", "Dark Pop"], members: ["Finneas"], bio: "Teenage bedroom-pop prodigy turned global pop force." },
  { name: "Sade", genres: ["Smooth Soul", "Quiet Storm"], bio: "British-Nigerian singer whose unhurried, velvet soul is all restraint." },
  { name: "Wilco", genres: ["Alternative Country", "Indie Rock"], members: ["Jeff Tweedy"], bio: "Chicago band that took alt-country apart and rebuilt it as art rock." },
  { name: "Pixies", genres: ["Alternative Rock", "Indie Rock"], members: ["Black Francis", "Joey Santiago", "Kim Deal", "David Lovering"], bio: "Boston band whose quiet-loud blueprint ran through 90s rock." },
  { name: "Beyoncé", genres: ["Pop", "R&B"], bio: "Pop's most meticulous performer and album-as-event maker." },
  { name: "Amy Winehouse", genres: ["Soul", "Jazz"], bio: "North London singer with a vintage soul voice and razor-sharp lyrics." },
  { name: "Marvin Gaye", genres: ["Soul", "R&B"], bio: "Motown great whose protest-and-prayer masterpiece redefined soul." },
  { name: "Jeff Buckley", genres: ["Alternative Rock", "Singer-Songwriter"], bio: "Singer with a four-octave voice and one perfect album." },
  { name: "Oasis", genres: ["Britpop", "Rock"], members: ["Liam Gallagher", "Noel Gallagher", "Paul Arthurs", "Paul McGuigan", "Alan White"], bio: "Manchester swagger, huge choruses, Britpop's defining band." },
];

export const SEED_ALBUMS: SeedAlbum[] = [
  {
    artist: "Frank Ocean", title: "Blonde", date: "2016-08-20", label: "Boys Don't Cry", genres: ["Alternative R&B", "Art Pop"],
    palette: ["#c9d6c5", "#47704f", "#f3efe6"], pattern: 0, producers: ["Frank Ocean", "Malay", "Om'Mas Keith", "Buddy Ross"],
    tracks: ["Nikes|5:14|E", "Ivy|4:09|E", "Pink + White|3:04", "Be Yourself|1:26", "Solo|4:17|E", "Skyline To|3:04|E", "Self Control|4:09", "Good Guy|1:06", "Nights|5:07|E", "Solo (Reprise)|1:18|André 3000|E", "Pretty Sweet|2:38", "Facebook Story|1:08", "Close to You|1:25", "White Ferrari|4:08", "Seigfried|5:34", "Godspeed|2:57", "Futura Free|9:24|E"],
  },
  {
    artist: "Frank Ocean", title: "channel ORANGE", date: "2012-07-10", label: "Def Jam", genres: ["Alternative R&B", "Neo-Soul"],
    palette: ["#f28a1e", "#ffb347", "#1b1b1b"], pattern: 1, producers: ["Frank Ocean", "Malay", "Om'Mas Keith"],
    tracks: ["Start|0:45", "Thinkin Bout You|3:20", "Fertilizer|0:39", "Sierra Leone|2:28", "Sweet Life|4:22", "Not Just Money|1:00", "Super Rich Kids|5:04|Earl Sweatshirt|E", "Pilot Jones|3:04", "Crack Rock|3:44|E", "Pyramids|9:52|E", "Lost|3:54", "White|1:16|John Mayer", "Monks|3:20", "Bad Religion|2:55", "Pink Matter|4:28|André 3000", "Forrest Gump|3:14", "End|2:15"],
  },
  {
    artist: "Radiohead", title: "In Rainbows", date: "2007-10-10", label: "XL Recordings", genres: ["Art Rock", "Alternative Rock"],
    palette: ["#e8432d", "#f5d32b", "#0b0b0b"], pattern: 2, producers: ["Nigel Godrich"],
    tracks: ["15 Step|3:57", "Bodysnatchers|4:02", "Nude|4:15", "Weird Fishes/Arpeggi|5:18", "All I Need|3:48", "Faust Arp|2:09", "Reckoner|4:50", "House of Cards|5:28", "Jigsaw Falling into Place|4:09", "Videotape|4:39"],
  },
  {
    artist: "Radiohead", title: "OK Computer", date: "1997-05-21", label: "Parlophone", genres: ["Alternative Rock", "Art Rock"],
    palette: ["#9fb7c9", "#e9eef2", "#2b3a48"], pattern: 3, producers: ["Nigel Godrich", "Radiohead"],
    tracks: ["Airbag|4:44", "Paranoid Android|6:23", "Subterranean Homesick Alien|4:27", "Exit Music (For a Film)|4:24", "Let Down|4:59", "Karma Police|4:21", "Fitter Happier|1:57", "Electioneering|3:50", "Climbing Up the Walls|4:45", "No Surprises|3:48", "Lucky|4:19", "The Tourist|5:24"],
  },
  {
    artist: "Kendrick Lamar", title: "To Pimp a Butterfly", date: "2015-03-15", label: "Top Dawg / Aftermath / Interscope", genres: ["Hip-Hop", "Jazz Rap", "Conscious Hip-Hop"],
    palette: ["#3b3b3b", "#d9d4c7", "#111111"], pattern: 4, producers: ["Sounwave", "Terrace Martin", "Thundercat", "Flying Lotus", "Pharrell Williams"],
    tracks: ["Wesley's Theory|4:47|George Clinton;Thundercat|E", "For Free? (Interlude)|2:10|E", "King Kunta|3:54|E", "Institutionalized|4:31|Bilal;Anna Wise;Snoop Dogg|E", "These Walls|5:00|Bilal;Anna Wise;Thundercat|E", "u|4:28|E", "Alright|3:39|E", "For Sale? (Interlude)|4:51|E", "Momma|4:43|E", "Hood Politics|4:52|E", "How Much a Dollar Cost|4:21|James Fauntleroy;Ronald Isley|E", "Complexion (A Zulu Love)|4:23|Rapsody|E", "The Blacker the Berry|5:28|E", "You Ain't Gotta Lie (Momma Said)|4:01|E", "i|5:36|E", "Mortal Man|12:07|E"],
  },
  {
    artist: "Kanye West", title: "My Beautiful Dark Twisted Fantasy", date: "2010-11-22", label: "Roc-A-Fella / Def Jam", genres: ["Hip-Hop", "Art Pop"],
    palette: ["#c0161c", "#e83a2e", "#2a0606"], pattern: 5, producers: ["Kanye West", "Mike Dean", "No I.D.", "Jeff Bhasker", "RZA"],
    tracks: ["Dark Fantasy|4:40|E", "Gorgeous|5:57|Kid Cudi;Raekwon|E", "Power|4:52|E", "All of the Lights (Interlude)|1:02", "All of the Lights|5:00|Rihanna;Kid Cudi|E", "Monster|6:18|Jay-Z;Rick Ross;Nicki Minaj;Bon Iver|E", "So Appalled|6:38|Jay-Z;Pusha T;Prynce Cy Hi;Swizz Beatz;RZA|E", "Devil in a New Dress|5:52|Rick Ross|E", "Runaway|9:08|Pusha T|E", "Hell of a Life|5:27|E", "Blame Game|7:49|John Legend|E", "Lost in the World|4:16|Bon Iver", "Who Will Survive in America|1:38"],
  },
  {
    artist: "Tame Impala", title: "Currents", date: "2015-07-17", label: "Modular", genres: ["Psychedelic Pop", "Synth-Pop"],
    palette: ["#5b2a86", "#e8505b", "#f9d56e"], pattern: 6, producers: ["Kevin Parker"], writers: ["Kevin Parker"],
    tracks: ["Let It Happen|7:47", "Nangs|1:47", "The Moment|4:15", "Yes I'm Changing|4:30", "Eventually|5:19", "Gossip|0:55", "The Less I Know the Better|3:36", "Past Life|3:48", "Disciples|1:48", "'Cause I'm a Man|4:01", "Reality in Motion|4:12", "Love/Paranoia|3:05", "New Person, Same Old Mistakes|6:03"],
  },
  {
    artist: "Beach House", title: "Depression Cherry", date: "2015-08-28", label: "Sub Pop", genres: ["Dream Pop"],
    palette: ["#a3111f", "#d6283a", "#4a050c"], pattern: 7, producers: ["Beach House", "Chris Coady"],
    tracks: ["Levitation|6:02", "Sparks|5:21", "Space Song|5:20", "Beyond Love|4:28", "10:37|3:51", "PPP|6:07", "Wildflower|3:39", "Bluebird|3:44", "Days of Candy|5:46"],
  },
  {
    artist: "Mitski", title: "Be the Cowboy", date: "2018-08-17", label: "Dead Oceans", genres: ["Indie Rock", "Art Pop"],
    palette: ["#c43a3a", "#f0c9a5", "#2d1b14"], pattern: 8, producers: ["Patrick Hyland"], writers: ["Mitski"],
    tracks: ["Geyser|2:23", "Why Didn't You Stop Me?|2:21", "Old Friend|1:52", "A Pearl|2:36", "Lonesome Love|1:51", "Remember My Name|2:16", "Me and My Husband|2:17", "Come into the Water|1:13", "Nobody|3:13", "Pink in the Night|2:16", "A Horse Named Cold Air|1:46", "Washing Machine Heart|2:08", "Blue Light|1:52", "Two Slow Dancers|3:59"],
  },
  {
    artist: "Arctic Monkeys", title: "AM", date: "2013-09-09", label: "Domino", genres: ["Indie Rock", "Alternative Rock"],
    palette: ["#0a0a0a", "#f2f2f2", "#3c3c3c"], pattern: 9, producers: ["James Ford", "Ross Orton"], writers: ["Alex Turner"],
    tracks: ["Do I Wanna Know?|4:32", "R U Mine?|3:21", "One for the Road|3:26", "Arabella|3:27", "I Want It All|3:05", "No. 1 Party Anthem|4:03", "Mad Sounds|3:35", "Fireside|3:01", "Why'd You Only Call Me When You're High?|2:41", "Snap Out of It|3:13", "Knee Socks|4:17", "I Wanna Be Yours|3:04"],
  },
  {
    artist: "SZA", title: "Ctrl", date: "2017-06-09", label: "Top Dawg / RCA", genres: ["Alternative R&B", "Neo-Soul"],
    palette: ["#5c7f3a", "#c9b07a", "#1d2a14"], pattern: 10, producers: ["ThankGod4Cody", "Scum", "Carter Lang", "Frank Dukes"],
    tracks: ["Supermodel|3:01|E", "Love Galore|4:35|Travis Scott|E", "Doves in the Wind|4:26|Kendrick Lamar|E", "Drew Barrymore|3:51", "Prom|3:16", "The Weekend|4:32|E", "Go Gina|2:42|E", "Garden (Say It Like Dat)|3:28", "Broken Clocks|3:51|E", "Anything|2:32", "Wavy (Interlude)|1:05|James Fauntleroy", "Normal Girl|4:13", "Pretty Little Birds|3:34|Isaiah Rashad|E", "20 Something|3:18"],
  },
  {
    artist: "Daft Punk", title: "Discovery", date: "2001-03-12", label: "Virgin", genres: ["French House", "Electronic"],
    palette: ["#101030", "#c7a8ff", "#ff5ea8"], pattern: 11, producers: ["Thomas Bangalter", "Guy-Manuel de Homem-Christo"],
    tracks: ["One More Time|5:20", "Aerodynamic|3:27", "Digital Love|4:58", "Harder, Better, Faster, Stronger|3:44", "Crescendolls|3:31", "Nightvision|1:44", "Superheroes|3:57", "High Life|3:21", "Something About Us|3:51", "Voyager|3:47", "Veridis Quo|5:44", "Short Circuit|3:26", "Face to Face|3:58", "Too Long|10:00"],
  },
  {
    artist: "My Bloody Valentine", title: "Loveless", date: "1991-11-04", label: "Creation", genres: ["Shoegaze", "Noise Pop"],
    palette: ["#e6007e", "#ff6fb7", "#3a0020"], pattern: 12, producers: ["Kevin Shields", "Colm Ó Cíosóig"], writers: ["Kevin Shields"],
    tracks: ["Only Shallow|4:17", "Loomer|2:38", "Touched|0:56", "To Here Knows When|5:31", "When You Sleep|4:11", "I Only Said|5:34", "Come in Alone|3:58", "Sometimes|5:19", "Blown a Wish|3:36", "What You Want|5:33", "Soon|6:58"],
  },
  {
    artist: "Fleetwood Mac", title: "Rumours", date: "1977-02-04", label: "Warner Bros.", genres: ["Soft Rock", "Pop Rock"],
    palette: ["#d9cbb0", "#6b5a45", "#f6f0e4"], pattern: 13, producers: ["Fleetwood Mac", "Ken Caillat", "Richard Dashut"],
    tracks: ["Second Hand News|2:43", "Dreams|4:14", "Never Going Back Again|2:02", "Don't Stop|3:11", "Go Your Own Way|3:38", "Songbird|3:20", "The Chain|4:30", "You Make Loving Fun|3:31", "I Don't Want to Know|3:15", "Oh Daddy|3:56", "Gold Dust Woman|4:56"],
  },
  {
    artist: "Bon Iver", title: "For Emma, Forever Ago", date: "2007-07-08", label: "Jagjaguwar", genres: ["Indie Folk"],
    palette: ["#a9b3a4", "#e9e4d8", "#4b4f45"], pattern: 14, producers: ["Justin Vernon"], writers: ["Justin Vernon"],
    tracks: ["Flume|3:39", "Lump Sum|3:21", "Skinny Love|3:58", "The Wolves (Act I and II)|5:22", "Blindsided|5:29", "Creature Fear|3:06", "Team|1:57", "For Emma|3:41", "Re: Stacks|6:41"],
  },
  {
    artist: "Miles Davis", title: "Kind of Blue", date: "1959-08-17", label: "Columbia", genres: ["Jazz", "Modal Jazz"],
    palette: ["#1f3c88", "#e9e9e9", "#0d1a3d"], pattern: 15, producers: ["Teo Macero", "Irving Townsend"], writers: ["Miles Davis", "Bill Evans"],
    tracks: ["So What|9:22", "Freddie Freeloader|9:46", "Blue in Green|5:37", "All Blues|11:33", "Flamenco Sketches|9:26"],
  },
  {
    artist: "Phoebe Bridgers", title: "Punisher", date: "2020-06-18", label: "Dead Oceans", genres: ["Indie Folk", "Indie Rock"],
    palette: ["#2e1a47", "#d94f3d", "#f2c14e"], pattern: 16, producers: ["Tony Berg", "Ethan Gruska", "Phoebe Bridgers"],
    tracks: ["DVD Menu|1:10", "Garden Song|3:39", "Kyoto|3:04", "Punisher|3:44", "Halloween|4:58|Conor Oberst", "Chinese Satellite|3:37", "Moon Song|4:39", "Savior Complex|4:03", "ICU|3:34", "Graceland Too|4:04", "I Know the End|5:44"],
  },
  {
    artist: "Tyler, The Creator", title: "IGOR", date: "2019-05-17", label: "Columbia", genres: ["Neo-Soul", "Hip-Hop", "Funk"],
    palette: ["#f4b6c2", "#f7d5dc", "#3a2a2e"], pattern: 17, producers: ["Tyler, The Creator"], writers: ["Tyler Okonma"],
    tracks: ["IGOR'S THEME|3:20|E", "EARFQUAKE|3:10|Playboi Carti|E", "I THINK|3:32", "EXACTLY WHAT YOU RUN FROM YOU END UP CHASING|0:14", "RUNNING OUT OF TIME|2:57", "NEW MAGIC WAND|3:15|E", "A BOY IS A GUN*|3:30|E", "PUPPET|2:59|E", "WHAT'S GOOD|3:25|E", "GONE, GONE / THANK YOU|6:15", "I DON'T LOVE YOU ANYMORE|2:41|E", "ARE WE STILL FRIENDS?|4:25"],
  },
  {
    artist: "Charli xcx", title: "BRAT", date: "2024-06-07", label: "Atlantic", genres: ["Hyperpop", "Electronic", "Pop"],
    palette: ["#8ace00", "#9be000", "#000000"], pattern: 18, producers: ["A. G. Cook", "Finn Keane", "George Daniel", "Hudson Mohawke"],
    tracks: ["360|2:13|E", "Club classics|2:32|E", "Sympathy is a knife|2:34", "I might say something stupid|2:28", "Talk talk|2:42", "Von dutch|2:11|E", "Everything is romantic|3:23", "Rewind|2:36", "So I|3:43", "Girl, so confusing|2:55", "Apple|2:31", "B2b|2:59|E", "Mean girls|4:09|E", "I think about it all the time|2:42", "365|3:24|E"],
  },
  {
    artist: "The Strokes", title: "Is This It", date: "2001-07-30", label: "RCA / Rough Trade", genres: ["Garage Rock", "Indie Rock"],
    palette: ["#d8a24a", "#1a1a1a", "#efe6d2"], pattern: 19, producers: ["Gordon Raphael"], writers: ["Julian Casablancas"],
    tracks: ["Is This It|2:35", "The Modern Age|3:32", "Soma|2:37", "Barely Legal|3:58", "Someday|3:07", "Alone, Together|3:12", "Last Nite|3:17", "Hard to Explain|3:47", "New York City Cops|3:36", "Trying Your Luck|3:27", "Take It or Leave It|3:16"],
  },
  {
    artist: "Aphex Twin", title: "Selected Ambient Works 85–92", date: "1992-11-09", label: "Apollo / R&S", genres: ["Ambient Techno", "IDM", "Electronic"],
    palette: ["#c8b9a4", "#4a4038", "#efe6d6"], pattern: 20, producers: ["Richard D. James"], writers: ["Richard D. James"],
    tracks: ["Xtal|4:51", "Tha|9:01", "Pulsewidth|3:47", "Ageispolis|5:21", "i|1:13", "Green Calx|6:02", "Heliosphan|4:51", "We Are the Music Makers|7:42", "Schottkey 7th Path|5:07", "Ptolemy|7:12", "Hedphelym|6:00", "Delphium|5:36", "Actium|7:35"],
  },
  {
    artist: "Slowdive", title: "Souvlaki", date: "1993-05-17", label: "Creation", genres: ["Shoegaze", "Dream Pop"],
    palette: ["#6a7d8c", "#c9d3d9", "#1e262c"], pattern: 21, producers: ["Neil Halstead", "Ed Buller"], writers: ["Neil Halstead"],
    tracks: ["Alison|3:51", "Machine Gun|4:27", "40 Days|3:15", "Sing|4:48", "Here She Comes|2:17", "Souvlaki Space Station|5:59", "When the Sun Hits|4:46", "Altogether|3:42", "Melon Yellow|3:52", "Dagger|3:34"],
  },
  {
    artist: "Lana Del Rey", title: "Born to Die", date: "2012-01-27", label: "Interscope", genres: ["Baroque Pop", "Pop"],
    palette: ["#8fb3d1", "#d94a4a", "#f1e7d8"], pattern: 2, producers: ["Emile Haynie", "Patrik Berger", "Justin Parker"],
    tracks: ["Born to Die|4:46", "Off to the Races|5:00|E", "Blue Jeans|3:29", "Video Games|4:42", "Diet Mountain Dew|3:44", "National Anthem|3:51|E", "Dark Paradise|4:03", "Radio|3:34|E", "Carmen|4:09|E", "Million Dollar Man|3:51", "Summertime Sadness|4:25", "This Is What Makes Us Girls|3:58|E"],
  },
  {
    artist: "The Weeknd", title: "After Hours", date: "2020-03-20", label: "XO / Republic", genres: ["Synthpop", "Alternative R&B"],
    palette: ["#b3121f", "#1a0a0c", "#e9d6a8"], pattern: 3, producers: ["The Weeknd", "Max Martin", "Metro Boomin", "Illangelo", "Oneohtrix Point Never"],
    tracks: ["Alone Again|4:10|E", "Too Late|3:59", "Hardest to Love|3:31", "Scared to Live|3:11", "Snowchild|4:07|E", "Escape from LA|5:55|E", "Heartless|3:18|E", "Faith|4:43|E", "Blinding Lights|3:20", "In Your Eyes|3:57", "Save Your Tears|3:35", "Repeat After Me (Interlude)|3:15", "After Hours|6:01|E"],
  },
  {
    artist: "Childish Gambino", title: "Awaken, My Love!", date: "2016-12-02", label: "Glassnote", genres: ["Funk", "Psychedelic Soul"],
    palette: ["#c4551c", "#2b1810", "#f0c36a"], pattern: 4, producers: ["Ludwig Göransson", "Donald Glover"],
    tracks: ["Me and Your Mama|6:18", "Have Some Love|3:25", "Boogieman|3:36", "Zombies|3:21", "Riot|3:41", "Redbone|5:26", "California|4:15", "Terrified|3:52", "Baby Boy|4:04", "The Night Me and Your Mama Met|2:02", "Stand Tall|4:30"],
  },
  {
    artist: "Travis Scott", title: "Astroworld", date: "2018-08-03", label: "Cactus Jack / Epic", genres: ["Hip-Hop", "Trap"],
    palette: ["#6b2fa5", "#ef7d2b", "#14081f"], pattern: 5, producers: ["Travis Scott", "Tay Keith", "Mike Dean", "Hit-Boy"],
    tracks: ["Stargazing|4:30|E", "Carousel|3:00|Frank Ocean|E", "Sicko Mode|5:12|Drake|E", "R.I.P. Screw|3:04|Swae Lee|E", "Stop Trying to Be God|5:38|James Blake;Kid Cudi;Stevie Wonder|E", "No Bystanders|3:38|E", "Skeletons|2:25|Tame Impala;The Weeknd|E", "Wake Up|3:51|The Weeknd|E", "5% Tint|3:16|E", "NC-17|2:36|E", "Astrothunder|2:21|E", "Yosemite|3:30|E", "Can't Say|3:19|Don Toliver|E", "Who? What!|3:24|E", "Butterfly Effect|3:11|E", "Coffee Bean|3:29|E"],
  },
  {
    artist: "Joy Division", title: "Unknown Pleasures", date: "1979-06-15", label: "Factory", genres: ["Post-Punk", "Gothic Rock"],
    palette: ["#0c0c0c", "#f2f2f2", "#6a6a6a"], pattern: 0, producers: ["Martin Hannett"], writers: ["Joy Division"],
    tracks: ["Disorder|3:32", "Day of the Lords|4:50", "Candidate|3:05", "Insight|4:29", "New Dawn Fades|4:47", "She's Lost Control|3:57", "Shadowplay|3:55", "Wilderness|2:38", "Interzone|2:16", "I Remember Nothing|5:53"],
  },
  {
    artist: "The Cure", title: "Disintegration", date: "1989-05-02", label: "Fiction", genres: ["Gothic Rock", "Alternative Rock"],
    palette: ["#233a52", "#7a5b8f", "#0b0f18"], pattern: 1, producers: ["Robert Smith", "David M. Allen"], writers: ["Robert Smith"],
    tracks: ["Plainsong|5:12", "Pictures of You|7:24", "Closedown|4:16", "Lovesong|3:29", "Last Dance|4:42", "Lullaby|4:08", "Fascination Street|5:16", "Prayers for Rain|6:05", "The Same Deep Water as You|9:19", "Disintegration|8:18", "Homesick|7:06", "Untitled|6:30"],
  },
  {
    artist: "Pink Floyd", title: "The Dark Side of the Moon", date: "1973-03-01", label: "Harvest", genres: ["Progressive Rock", "Psychedelic Rock"],
    palette: ["#0a0a0f", "#d83a7a", "#4aa3e6"], pattern: 2, producers: ["Pink Floyd"], writers: ["Roger Waters", "David Gilmour"],
    tracks: ["Speak to Me|1:07", "Breathe (In the Air)|2:49", "On the Run|3:45", "Time|6:53", "The Great Gig in the Sky|4:36", "Money|6:23", "Us and Them|7:49", "Any Colour You Like|3:25", "Brain Damage|3:46", "Eclipse|2:03"],
  },
  {
    artist: "David Bowie", title: "The Rise and Fall of Ziggy Stardust and the Spiders from Mars", date: "1972-06-16", label: "RCA", genres: ["Glam Rock", "Art Rock"],
    palette: ["#e3472b", "#1b2a6b", "#f6e9c9"], pattern: 3, producers: ["Ken Scott", "David Bowie"], writers: ["David Bowie"],
    tracks: ["Five Years|4:42", "Soul Love|3:34", "Moonage Daydream|4:40", "Starman|4:16", "It Ain't Easy|3:00", "Lady Stardust|3:21", "Star|2:47", "Hang On to Yourself|2:40", "Ziggy Stardust|3:13", "Suffragette City|3:25", "Rock 'n' Roll Suicide|2:58"],
  },
  {
    artist: "Nirvana", title: "Nevermind", date: "1991-09-24", label: "DGC", genres: ["Grunge", "Alternative Rock"],
    palette: ["#2f7fc4", "#f3d36b", "#103c63"], pattern: 4, producers: ["Butch Vig"], writers: ["Kurt Cobain"],
    tracks: ["Smells Like Teen Spirit|5:01|E", "In Bloom|4:14", "Come as You Are|3:39", "Breed|3:03", "Lithium|4:17", "Polly|2:57", "Territorial Pissings|2:23|E", "Drain You|3:43", "Lounge Act|2:37", "Stay Away|3:32", "On a Plain|3:16", "Something in the Way|3:52"],
  },
  {
    artist: "Björk", title: "Homogenic", date: "1997-09-22", label: "One Little Indian", genres: ["Art Pop", "Electronic"],
    palette: ["#c96a4a", "#7e2f2a", "#f0d4b8"], pattern: 5, producers: ["Björk", "Mark Bell", "Guy Sigsworth", "Howie B"], writers: ["Björk"],
    tracks: ["Hunter|4:15", "Jóga|5:05", "Unravel|3:21", "Bachelorette|5:12", "All Neon Like|5:53", "5 Years|3:54", "Immature|3:08", "Alarm Call|4:19", "Pluto|3:19", "All Is Full of Love|4:33"],
  },
  {
    artist: "Portishead", title: "Dummy", date: "1994-08-22", label: "Go! Beat", genres: ["Trip Hop"],
    palette: ["#4f5a63", "#c4b49a", "#14181b"], pattern: 0, producers: ["Geoff Barrow", "Adrian Utley"], writers: ["Beth Gibbons", "Geoff Barrow", "Adrian Utley"],
    tracks: ["Mysterons|5:02", "Sour Times|4:11", "Strangers|3:55", "It Could Be Sweet|4:18", "Wandering Star|4:51", "It's a Fire|3:49", "Numb|3:53", "Roads|5:02", "Pedestal|3:39", "Biscuit|5:02", "Glory Box|5:06"],
  },
  {
    artist: "Massive Attack", title: "Mezzanine", date: "1998-04-20", label: "Virgin", genres: ["Trip Hop", "Electronic"],
    palette: ["#3b2a20", "#d4a24a", "#0f0b09"], pattern: 1, producers: ["Massive Attack", "Neil Davidge", "Mark Stent"], writers: ["Robert Del Naja", "Grant Marshall"],
    tracks: ["Angel|6:18", "Risingson|5:38", "Teardrop|5:29", "Inertia Creeps|5:57", "Exchange|4:11", "Dissolved Girl|6:07", "Man Next Door|5:57", "Black Milk|6:20", "Mezzanine|5:56", "Group Four|8:14", "(Exchange)|5:49"],
  },
  {
    artist: "Joni Mitchell", title: "Blue", date: "1971-06-22", label: "Reprise", genres: ["Folk", "Singer-Songwriter"],
    palette: ["#1f4f8a", "#9cc3e6", "#0b1e36"], pattern: 2, producers: ["Joni Mitchell", "Henry Lewy"], writers: ["Joni Mitchell"],
    tracks: ["All I Want|3:32", "My Old Man|3:33", "Little Green|3:25", "Carey|3:00", "Blue|2:34", "California|3:51", "This Flight Tonight|2:50", "River|4:00", "A Case of You|4:20", "The Last Time I Saw Richard|4:13"],
  },
  {
    artist: "Nick Drake", title: "Pink Moon", date: "1972-02-25", label: "Island", genres: ["Folk", "Chamber Folk"],
    palette: ["#e8b4c0", "#4a5a86", "#1d2036"], pattern: 3, producers: ["John Wood"], writers: ["Nick Drake"],
    tracks: ["Pink Moon|2:03", "Place to Be|2:43", "Road|2:01", "Which Will|2:57", "Horn|1:20", "Things Behind the Sun|3:58", "Know|2:25", "Parasite|3:37", "Free Ride|3:06", "Harvest Breed|1:07", "From the Morning|2:30"],
  },
  {
    artist: "Sufjan Stevens", title: "Carrie & Lowell", date: "2015-03-31", label: "Asthmatic Kitty", genres: ["Indie Folk", "Chamber Pop"],
    palette: ["#e9e4da", "#8aa7b8", "#2e3a40"], pattern: 4, producers: ["Sufjan Stevens"], writers: ["Sufjan Stevens"],
    tracks: ["Death with Dignity|3:39", "Should Have Known Better|5:07", "All of Me Wants All of You|3:47", "Drawn to the Blood|3:20", "Eugene|2:26", "Fourth of July|4:38", "The Only Thing|4:46", "Carrie & Lowell|3:09", "John My Beloved|4:10", "No Shade in the Shadow of the Cross|2:42", "Blue Bucket of Gold|5:21"],
  },
  {
    artist: "Lorde", title: "Melodrama", date: "2017-06-16", label: "Lava / Republic", genres: ["Art Pop", "Electropop"],
    palette: ["#1d6f8a", "#e3516a", "#0d1d29"], pattern: 5, producers: ["Jack Antonoff", "Lorde", "Frank Dukes"], writers: ["Lorde", "Jack Antonoff"],
    tracks: ["Green Light|3:54", "Sober|3:17", "Homemade Dynamite|3:09", "The Louvre|4:31", "Liability|2:52", "Hard Feelings/Loveless|3:57|E", "Sober II (Melodrama)|2:55", "Writer in the Dark|3:36", "Supercut|4:36", "Liability (Reprise)|1:00", "Perfect Places|3:40"],
  },
  {
    artist: "Lauryn Hill", title: "The Miseducation of Lauryn Hill", date: "1998-08-25", label: "Ruffhouse / Columbia", genres: ["Neo-Soul", "Hip-Hop"],
    palette: ["#c28a3a", "#4c2f1a", "#f0dcb4"], pattern: 0, producers: ["Lauryn Hill", "Che Pope", "Vada Nobles"], writers: ["Lauryn Hill"],
    tracks: ["Intro|0:47", "Lost Ones|5:33|E", "Ex-Factor|5:26", "To Zion|6:09|Carlos Santana", "Doo Wop (That Thing)|5:20", "Superstar|4:57", "Final Hour|4:15", "When It Hurts So Bad|5:42", "I Used to Love Him|5:39|Mary J. Blige", "Forgive Them Father|5:15", "Every Ghetto, Every City|5:14", "Nothing Even Matters|5:50|D'Angelo", "Everything Is Everything|4:53", "The Miseducation of Lauryn Hill|4:05", "Can't Take My Eyes Off of You|3:33", "Tell Him|4:41"],
  },
  {
    artist: "D'Angelo", title: "Voodoo", date: "2000-01-25", label: "Virgin", genres: ["Neo-Soul", "Funk"],
    palette: ["#a3541f", "#1c120c", "#e6b46a"], pattern: 1, producers: ["D'Angelo", "Questlove", "James Poyser", "DJ Premier"], writers: ["D'Angelo"],
    tracks: ["Playa Playa|5:07", "Devil's Pie|5:21", "Left & Right|4:30|Method Man;Redman", "The Line|4:20", "Send It On|4:36", "Chicken Grease|4:13", "One Mo'gin|5:58", "The Root|5:57", "Spanish Joint|4:12", "Feel Like Makin' Love|4:41", "Greatest Love|5:20", "Untitled (How Does It Feel)|7:10", "Africa|5:23"],
  },
  {
    artist: "Mac Miller", title: "Swimming", date: "2018-08-03", label: "REMember / Warner", genres: ["Hip-Hop", "Jazz Rap"],
    palette: ["#2d7fb8", "#f3e4b0", "#0f2a3d"], pattern: 2, producers: ["Mac Miller", "Jon Brion", "Dev Hynes", "Tae Beast"], writers: ["Mac Miller"],
    tracks: ["Come Back to Earth|3:20", "Hurt Feelings|4:12", "What's the Use?|4:30|Thundercat", "Perfecto|3:16", "Self Care|5:45|E", "Wings|3:26", "Ladders|3:51", "Small Worlds|2:55", "Conversation, Pt. 1|3:30|Snoop Dogg", "Dunno|3:40", "So It Goes|5:15"],
  },
  {
    artist: "Gorillaz", title: "Demon Days", date: "2005-05-23", label: "Parlophone", genres: ["Alternative Rock", "Electronic"],
    palette: ["#3a3a2c", "#d5c24a", "#c4472b"], pattern: 3, producers: ["Danger Mouse", "Damon Albarn"], writers: ["Damon Albarn"],
    tracks: ["Intro|1:03", "Last Living Souls|3:11", "Kids with Guns|3:45", "O Green World|4:31", "Dirty Harry|3:43", "Feel Good Inc.|3:41|De La Soul", "El Mañana|3:50", "Every Planet We Reach Is Dead|4:53", "November Has Come|3:59|MF DOOM", "All Alone|3:30", "White Light|2:08", "DARE|4:04", "Fire Coming Out of the Monkey's Head|3:16", "Don't Get Lost in Heaven|2:00", "Demon Days|4:29"],
  },
  {
    artist: "LCD Soundsystem", title: "Sound of Silver", date: "2007-03-12", label: "DFA / Capitol", genres: ["Dance-Punk", "Electronic"],
    palette: ["#b8bcc4", "#2b2e36", "#e8e4d6"], pattern: 4, producers: ["James Murphy"], writers: ["James Murphy"],
    tracks: ["Get Innocuous!|7:11", "Time to Get Away|4:13", "North American Scum|5:25", "Someone Great|6:25", "All My Friends|7:37", "Us v Them|7:15", "Watch the Tapes|4:54", "Sound of Silver|7:07", "New York, I Love You but You're Bringing Me Down|5:34"],
  },
  {
    artist: "The Smiths", title: "The Queen Is Dead", date: "1986-06-16", label: "Rough Trade", genres: ["Indie Rock", "Jangle Pop"],
    palette: ["#2c3b2a", "#c9b36a", "#101810"], pattern: 5, producers: ["Morrissey", "Johnny Marr", "Stephen Street"], writers: ["Morrissey", "Johnny Marr"],
    tracks: ["The Queen Is Dead|6:25", "Frankly, Mr. Shankly|2:17", "I Know It's Over|5:49", "Never Had No One Ever|3:36", "Cemetry Gates|2:41", "Bigmouth Strikes Again|3:13", "The Boy with the Thorn in His Side|3:16", "Vicar in a Tutu|2:23", "There Is a Light That Never Goes Out|4:02", "Some Girls Are Bigger Than Others|3:15"],
  },
  {
    artist: "Talking Heads", title: "Remain in Light", date: "1980-10-08", label: "Sire", genres: ["New Wave", "Art Rock"],
    palette: ["#c93a2a", "#1a1a1a", "#efe4c8"], pattern: 0, producers: ["Brian Eno", "Talking Heads"], writers: ["David Byrne", "Brian Eno"],
    tracks: ["Born Under Punches (The Heat Goes On)|5:46", "Crosseyed and Painless|4:45", "The Great Curve|6:26", "Once in a Lifetime|4:19", "Houses in Motion|4:30", "Seen and Not Seen|3:21", "Listening Wind|4:42", "The Overload|6:00"],
  },
  {
    artist: "The Velvet Underground", title: "The Velvet Underground & Nico", date: "1967-03-12", label: "Verve", genres: ["Art Rock", "Experimental Rock"],
    palette: ["#f2e24a", "#e8e8e0", "#1a1a1a"], pattern: 1, producers: ["Andy Warhol", "Tom Wilson"], writers: ["Lou Reed"],
    tracks: ["Sunday Morning|2:56", "I'm Waiting for the Man|4:39", "Femme Fatale|2:38|Nico", "Venus in Furs|5:12", "Run Run Run|4:22", "All Tomorrow's Parties|6:00|Nico", "Heroin|7:12|E", "There She Goes Again|2:42", "I'll Be Your Mirror|2:12|Nico", "The Black Angel's Death Song|3:12", "European Son|7:47"],
  },
  {
    artist: "FKA twigs", title: "MAGDALENE", date: "2019-11-08", label: "Young / Atlantic", genres: ["Art Pop", "Experimental R&B"],
    palette: ["#c9a67a", "#3a2a2a", "#e8d9c4"], pattern: 2, producers: ["FKA twigs", "Nicolas Jaar", "Jack Antonoff", "Skrillex"], writers: ["FKA twigs"],
    tracks: ["thousand eyes|2:49", "home with you|4:10", "sad day|3:34", "holy terrain|3:33|Future|E", "mary magdalene|4:12", "fallen alien|3:18", "mirrored heart|3:12", "daybed|4:20", "cellophane|3:25", "words i don't remember|2:28"],
  },
  {
    artist: "Billie Eilish", title: "When We All Fall Asleep, Where Do We Go?", date: "2019-03-29", label: "Darkroom / Interscope", genres: ["Electropop", "Dark Pop"],
    palette: ["#9ae03a", "#0d0d0d", "#e8e8e8"], pattern: 3, producers: ["Finneas O'Connell"], writers: ["Billie Eilish", "Finneas O'Connell"],
    tracks: ["!!!!!!!|0:13", "bad guy|3:14", "xanny|4:03", "you should see me in a crown|3:00", "all the good girls go to hell|2:49", "wish you were gay|3:41", "when the party's over|3:15", "8|2:53", "my strange addiction|2:59", "bury a friend|3:13", "ilomilo|2:36", "listen before i go|4:03", "i love you|4:51", "goodbye|1:59"],
  },
  {
    artist: "Sade", title: "Love Deluxe", date: "1992-10-27", label: "Epic", genres: ["Smooth Soul", "Quiet Storm"],
    palette: ["#b88a5a", "#2a1c14", "#f0d9b8"], pattern: 4, producers: ["Sade", "Mike Pela"], writers: ["Sade Adu", "Stuart Matthewman"],
    tracks: ["No Ordinary Love|7:20", "Feel No Pain|6:44", "I Couldn't Love You More|6:00", "Like a Tattoo|4:03", "Kiss of Life|4:10", "Cherish the Day|5:15", "Pearls|4:32", "Bullet Proof Soul|4:30", "Mermaid|3:57"],
  },
  {
    artist: "Wilco", title: "Yankee Hotel Foxtrot", date: "2002-04-23", label: "Nonesuch", genres: ["Alternative Country", "Indie Rock"],
    palette: ["#d9d3c0", "#3a4a5a", "#b8442a"], pattern: 5, producers: ["Wilco", "Jim O'Rourke"], writers: ["Jeff Tweedy"],
    tracks: ["I Am Trying to Break Your Heart|6:57", "Kamera|3:29", "Radio Cure|5:08", "War on War|3:47", "Jesus, Etc.|3:50", "Ashes of American Flags|4:43", "Heavy Metal Drummer|3:10", "I'm the Man Who Loves You|3:55", "Pot Kettle Black|4:00", "Poor Places|5:15", "Reservations|7:22"],
  },
  {
    artist: "Pixies", title: "Doolittle", date: "1989-04-17", label: "4AD", genres: ["Alternative Rock", "Indie Rock"],
    palette: ["#2f6b4a", "#e8c24a", "#12241a"], pattern: 0, producers: ["Gil Norton"], writers: ["Black Francis"],
    tracks: ["Debaser|2:52", "Tame|1:55", "Wave of Mutilation|2:03", "I Bleed|2:34", "Here Comes Your Man|3:21", "Dead|2:21", "Monkey Gone to Heaven|2:56", "Mr. Grieves|2:05", "Crackity Jones|1:24", "La La Love You|2:43", "No. 13 Baby|3:51", "There Goes My Gun|1:49", "Hey|3:31", "Silver|2:25", "Gouge Away|2:45"],
  },
  {
    artist: "Beyoncé", title: "Lemonade", date: "2016-04-23", label: "Parkwood / Columbia", genres: ["Pop", "R&B"],
    palette: ["#e3b13a", "#7a2f1a", "#f6e9b8"], pattern: 1, producers: ["Beyoncé", "Diplo", "Jack White", "Boots", "Mike Will Made-It"], writers: ["Beyoncé"],
    tracks: ["Pray You Catch Me|3:16", "Hold Up|3:41", "Don't Hurt Yourself|3:53|Jack White|E", "Sorry|3:52", "6 Inch|4:20|The Weeknd|E", "Daddy Lessons|4:48", "Love Drought|3:57", "Sandcastles|3:03", "Forward|1:19|James Blake", "Freedom|4:49|Kendrick Lamar|E", "All Night|5:22", "Formation|3:26|E"],
  },
  {
    artist: "Amy Winehouse", title: "Back to Black", date: "2006-10-27", label: "Island", genres: ["Soul", "Jazz"],
    palette: ["#1a1a1f", "#d94a5a", "#e8dcc8"], pattern: 2, producers: ["Mark Ronson", "Salaam Remi"], writers: ["Amy Winehouse"],
    tracks: ["Rehab|3:35", "You Know I'm No Good|4:17", "Me & Mr Jones|2:33", "Just Friends|3:13", "Back to Black|4:01", "Love Is a Losing Game|2:35", "Tears Dry on Their Own|3:06", "Wake Up Alone|3:44", "Some Unholy War|2:22", "He Can Only Hold Her|2:46", "Addicted|2:45"],
  },
  {
    artist: "Marvin Gaye", title: "What's Going On", date: "1971-05-21", label: "Tamla", genres: ["Soul", "R&B"],
    palette: ["#6a7a8a", "#d4c4a4", "#1c242c"], pattern: 3, producers: ["Marvin Gaye"], writers: ["Marvin Gaye"],
    tracks: ["What's Going On|3:53", "What's Happening Brother|2:03", "Flyin' High (In the Friendly Sky)|3:41", "Save the Children|4:03", "God Is Love|1:41", "Mercy Mercy Me (The Ecology)|3:15", "Right On|7:05", "Wholy Holy|3:08", "Inner City Blues (Make Me Wanna Holler)|5:27"],
  },
  {
    artist: "Jeff Buckley", title: "Grace", date: "1994-08-23", label: "Columbia", genres: ["Alternative Rock", "Singer-Songwriter"],
    palette: ["#3a4a6a", "#d4b88a", "#14182a"], pattern: 4, producers: ["Andy Wallace"], writers: ["Jeff Buckley"],
    tracks: ["Mojo Pin|5:41", "Grace|5:22", "Last Goodbye|4:35", "Lilac Wine|4:33", "So Real|4:43", "Hallelujah|6:53", "Lover, You Should've Come Over|6:44", "Corpus Christi Carol|2:57", "Eternal Life|4:43", "Dream Brother|5:26"],
  },
  {
    artist: "Oasis", title: "(What's the Story) Morning Glory?", date: "1995-10-02", label: "Creation", genres: ["Britpop", "Rock"],
    palette: ["#d8c8a8", "#6a7a5a", "#2a2a22"], pattern: 5, producers: ["Owen Morris", "Noel Gallagher"], writers: ["Noel Gallagher"],
    tracks: ["Hello|3:21", "Roll with It|3:59", "Wonderwall|4:18", "Don't Look Back in Anger|4:48", "Hey Now!|5:41", "The Swamp Song|0:40", "Some Might Say|5:29", "Cast No Shadow|4:51", "She's Electric|3:40", "Morning Glory|5:03", "The Swamp Song (Excerpt 2)|0:45", "Champagne Supernova|7:27"],
  },
];

// Songs that carry more popularity / social weight in the generated activity.
export const HIT_SONGS = new Set([
  "Nights", "Ivy", "Pink + White", "Self Control", "White Ferrari", "Nikes", "Thinkin Bout You", "Pyramids", "Super Rich Kids", "Bad Religion",
  "Weird Fishes/Arpeggi", "Reckoner", "Nude", "Paranoid Android", "Karma Police", "No Surprises", "Let Down", "Exit Music (For a Film)",
  "Alright", "King Kunta", "The Blacker the Berry", "Runaway", "Power", "All of the Lights", "Devil in a New Dress",
  "Let It Happen", "The Less I Know the Better", "New Person, Same Old Mistakes", "Eventually", "Space Song", "Levitation",
  "Nobody", "Two Slow Dancers", "Washing Machine Heart", "Do I Wanna Know?", "R U Mine?", "I Wanna Be Yours", "505",
  "The Weekend", "Love Galore", "Drew Barrymore", "Supermodel", "20 Something", "One More Time", "Digital Love", "Harder, Better, Faster, Stronger", "Something About Us", "Veridis Quo",
  "Only Shallow", "When You Sleep", "Soon", "Dreams", "The Chain", "Go Your Own Way", "Songbird", "Skinny Love", "Re: Stacks", "Flume",
  "So What", "Blue in Green", "Kyoto", "Garden Song", "I Know the End", "Moon Song", "EARFQUAKE", "ARE WE STILL FRIENDS?", "A BOY IS A GUN*", "NEW MAGIC WAND",
  "360", "Von dutch", "Apple", "Sympathy is a knife", "Last Nite", "Someday", "Hard to Explain", "Xtal", "Avril 14th", "Alison", "When the Sun Hits", "40 Days",
  "Video Games", "Summertime Sadness", "Blinding Lights", "Save Your Tears", "Redbone", "Sicko Mode", "Stargazing", "Love Will Tear Us Apart", "Shadowplay",
  "Pictures of You", "Lovesong", "Time", "Money", "Starman", "Suffragette City", "Smells Like Teen Spirit", "Come as You Are", "Lithium", "Jóga", "All Is Full of Love",
  "Glory Box", "Sour Times", "Teardrop", "A Case of You", "River", "Pink Moon", "Fourth of July", "Green Light", "Sober", "Doo Wop (That Thing)", "Ex-Factor",
  "Untitled (How Does It Feel)", "Self Care", "Feel Good Inc.", "All My Friends", "Someone Great", "There Is a Light That Never Goes Out", "Once in a Lifetime",
  "Femme Fatale", "Heroin", "bad guy", "when the party's over", "No Ordinary Love", "Jesus, Etc.", "Debaser", "Here Comes Your Man", "Formation", "Hold Up",
  "Rehab", "Back to Black", "What's Going On", "Mercy Mercy Me (The Ecology)", "Hallelujah", "Last Goodbye", "Wonderwall", "Don't Look Back in Anger", "Champagne Supernova",
]);
