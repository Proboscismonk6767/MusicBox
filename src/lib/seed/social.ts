// Seed community: users, review copy and hand-curated lists.
// All seed accounts share the password in SEED_PASSWORD (see README).

export const SEED_PASSWORD = "musicbox-demo";

export interface SeedUser {
  username: string;
  displayName: string;
  bio: string;
  location?: string;
  website?: string;
  hue: number;
  taste: Record<string, number>; // genre keyword → affinity
  generosity: number; // rating bias
  activity: number; // relative volume
  role?: "admin";
}

export const SEED_USERS: SeedUser[] = [
  { username: "abtin", displayName: "Abtin", bio: "Logging everything. Mostly R&B, shoegaze and whatever Alex sends me.", location: "London", hue: 38, taste: { "R&B": 1, Shoegaze: 0.8, "Dream Pop": 0.8, "Hip-Hop": 0.7, Art: 0.6 }, generosity: 0.2, activity: 1.1, role: "admin" },
  { username: "alex", displayName: "Alex Moreno", bio: "Ex-record store clerk. I will make you a list about it.", location: "Brooklyn", website: "https://example.com/alex", hue: 200, taste: { "Hip-Hop": 1, "R&B": 0.9, Jazz: 0.7, "Neo-Soul": 0.9 }, generosity: 0.3, activity: 1.4 },
  { username: "maya", displayName: "Maya Okafor", bio: "Dream pop evangelist. 4 stars is a compliment.", location: "Toronto", hue: 320, taste: { "Dream Pop": 1, Shoegaze: 1, "Indie Folk": 0.7, "Indie Rock": 0.6 }, generosity: -0.1, activity: 1.2 },
  { username: "sam", displayName: "Sam Lindqvist", bio: "Production nerd. Will talk about snare sounds for an hour.", location: "Stockholm", hue: 150, taste: { Electronic: 1, House: 1, IDM: 0.9, Psychedelic: 0.7, Pop: 0.5 }, generosity: 0, activity: 1 },
  { username: "daniel", displayName: "Daniel Reyes", bio: "Dad rock, sad rock, and the occasional Charli banger.", location: "Austin", hue: 20, taste: { Rock: 1, "Soft Rock": 1, "Indie Rock": 0.8, "Garage Rock": 0.8, Hyperpop: 0.4 }, generosity: 0.4, activity: 0.9 },
  { username: "priya", displayName: "Priya Shah", bio: "Writing about songs I can't stop replaying.", location: "Mumbai", hue: 270, taste: { "Art Pop": 1, "Indie Rock": 0.9, "Indie Folk": 0.9, "R&B": 0.6 }, generosity: 0.1, activity: 1.1 },
  { username: "theo", displayName: "Theo Park", bio: "Hip-hop head. Ratings are final. Reviews are not.", location: "Seoul", hue: 0, taste: { "Hip-Hop": 1, "Jazz Rap": 1, Funk: 0.8, "Neo-Soul": 0.7 }, generosity: -0.2, activity: 1 },
  { username: "noor", displayName: "Noor Haddad", bio: "Jazz in the morning, Radiohead at night.", location: "Beirut", hue: 180, taste: { Jazz: 1, "Art Rock": 1, "Alternative Rock": 0.8, Ambient: 0.7 }, generosity: 0, activity: 0.8 },
  { username: "kai", displayName: "Kai Nakamura", bio: "Hyperpop and club edits. Brat summer never ended.", location: "Osaka", hue: 90, taste: { Hyperpop: 1, Electronic: 0.9, Pop: 1, House: 0.7 }, generosity: 0.5, activity: 0.9 },
  { username: "rosa", displayName: "Rosa Klein", bio: "Folk, sadness, long walks. Phoebe Bridgers completionist.", location: "Berlin", hue: 350, taste: { "Indie Folk": 1, "Indie Rock": 0.8, "Art Pop": 0.7, "Soft Rock": 0.5 }, generosity: 0.2, activity: 1 },
  { username: "ellis", displayName: "Ellis Grant", bio: "Shoegaze or nothing. (Okay, some Radiohead.)", location: "Manchester", hue: 230, taste: { Shoegaze: 1, "Noise Pop": 1, "Dream Pop": 0.8, "Art Rock": 0.6 }, generosity: -0.3, activity: 0.8 },
  { username: "juno", displayName: "Juno Achebe", bio: "Here for the deep cuts.", location: "Lagos", hue: 60, taste: { "Neo-Soul": 1, "R&B": 1, Funk: 0.7, Jazz: 0.6 }, generosity: 0.1, activity: 0.7 },
];

// Review copy, keyed by rating band. Generic enough to fit any song.
export const REVIEWS: Record<"high" | "mid" | "low", string[]> = {
  high: [
    "Somehow this still gets better every time.",
    "The production on this is ridiculous. Every listen reveals a new layer.",
    "One of those songs that makes the room go quiet.",
    "I don't think I've ever skipped this. Not once.",
    "The bridge alone is worth five stars.",
    "Perfect from the first second to the last.",
    "This song is a whole season of my life.",
    "Put this on with good headphones and thank me later.",
    "Genuinely flawless songwriting.",
    "I heard this for the first time on a night bus and it rearranged my brain.",
    "the way it builds… unreal",
    "Comfort song. Non-negotiable.",
    "Every time I think I've overplayed it, it wins me back.",
    "The vocal performance here is staggering.",
    "Peak. That's the review.",
    "Used to be my favourite song. Might be again.",
  ],
  mid: [
    "Good, but the second half drags a little.",
    "Great idea, slightly underwritten.",
    "Grew on me after a few listens.",
    "Better in context of the album than on shuffle.",
    "Nice texture, not much of a hook.",
    "Solid. Not one I reach for often though.",
    "The intro promises more than the song delivers.",
    "Would be a 4 if it were a minute shorter.",
    "I respect it more than I enjoy it.",
    "Fun for a summer, didn't age as well for me.",
  ],
  low: [
    "Never clicked for me, sorry.",
    "The weakest track on an otherwise great record.",
    "I get why people love it. I just don't.",
    "Overplayed to death in my house.",
    "Sounds like a demo that escaped.",
  ],
};

// Song-specific reviews (title → reviews). Used preferentially when present.
export const SONG_REVIEWS: Record<string, string[]> = {
  Nights: ["Still one of the best beat switches ever.", "The switch at 3:30 is the most important moment in 2010s music.", "Two songs for the price of one and both are perfect."],
  "White Ferrari": ["Feels like being driven home half-asleep.", "The Beatles interpolation sneaking in is so tender."],
  "Self Control": ["The outro harmonies wreck me every single time."],
  Ivy: ["The guitar tone sounds like a memory."],
  Pyramids: ["Ten minutes and it never once feels long."],
  "Weird Fishes/Arpeggi": ["Those interlocking guitars are hypnotic.", "Best drumming on any Radiohead song, fight me."],
  Reckoner: ["Thom's falsetto over that tambourine is heaven."],
  "Paranoid Android": ["Three songs stitched together and every seam is perfect."],
  Alright: ["An anthem that actually earns the word."],
  Runaway: ["The distorted vocoder outro is a genuine act of courage."],
  "Let It Happen": ["When the 'skipping CD' bit hits I lose it every time."],
  "The Less I Know the Better": ["That bassline could power a small city."],
  "Space Song": ["Fall back into place… the slide guitar at the end, oh my god."],
  Nobody: ["Disco about loneliness. Mitski is a genius."],
  "Do I Wanna Know?": ["That riff is basically a heartbeat at 2am."],
  "One More Time": ["Happiest four minutes in music, objectively."],
  "Digital Love": ["The guitar solo sounds like falling in love in 8-bit."],
  "Only Shallow": ["That opening drum fill then THE WALL. Unmatched."],
  Soon: ["Shoegaze you can dance to. Rewired my sense of what guitars can do."],
  Dreams: ["Stevie Nicks wrote this in ten minutes and it's perfect."],
  "The Chain": ["The bass breakdown might be the greatest moment in rock."],
  "Skinny Love": ["Recorded in a cabin and you can feel the cold."],
  "Blue in Green": ["Bill Evans' piano intro is pure melancholy."],
  "So What": ["The bass and horns call and response is everything."],
  "I Know the End": ["The scream at the end is the most cathartic thing on record."],
  Kyoto: ["Trumpets! In a Phoebe song! Joy!"],
  EARFQUAKE: ["Don't leave, it's my fault 😭"],
  "360": ["Opening a pop album with this level of confidence is insane."],
  "Last Nite": ["The definitive 2001 song. Everyone in a leather jacket, forever."],
  Xtal: ["Sounds like sunlight through a dusty window."],
  Alison: ["Shoegaze at its most romantic."],
  "When the Sun Hits": ["The chorus feels like a wave hitting you."],
  "Two Slow Dancers": ["Closing track that makes you sit in silence afterward."],
};

export interface SeedList {
  owner: string;
  title: string;
  description: string;
  ranked: boolean;
  songs: (string | [string, string])[]; // title or [title, note]; "Title @ Artist" disambiguates
}

export const SEED_LISTS: SeedList[] = [
  {
    owner: "alex", title: "100 Songs Everyone Should Hear Once", description: "A starting point. Not a canon, just songs that changed how people hear things. (Work in progress — currently a lot fewer than 100.)", ranked: false,
    songs: ["Nights", "Paranoid Android", "Alright", "So What", "Dreams", "Only Shallow", "One More Time", "Runaway", "Last Nite", "Skinny Love", "Space Song", "Do I Wanna Know?", "The Chain", "Let It Happen", "I Know the End", "Xtal"],
  },
  {
    owner: "maya", title: "Songs That Feel Like Driving at 2AM", description: "Empty roads, orange streetlights, nobody else awake.", ranked: false,
    songs: [["White Ferrari", "The definitive one."], "Do I Wanna Know?", "Space Song", "Nights", "Weird Fishes/Arpeggi", "Veridis Quo", "New Person, Same Old Mistakes", "Alison", "Moon Song", "Blue in Green", "Levitation"],
  },
  {
    owner: "abtin", title: "Every Frank Ocean Song I've Logged, Ranked", description: "Updating as I go. Order is painful.", ranked: true,
    songs: [["Nights", "Still one of the best beat switches ever."], ["Self Control", "The outro."], "White Ferrari", "Ivy", "Pyramids", "Pink + White", "Thinkin Bout You", "Bad Religion", "Seigfried", "Nikes", "Super Rich Kids", "Godspeed", "Pink Matter", "Solo", "Lost"],
  },
  {
    owner: "daniel", title: "Summer 2026", description: "What this summer sounded like at our place.", ranked: false,
    songs: ["360", "Von dutch", "Apple", "The Less I Know the Better", "Go Your Own Way", "Last Nite", "One More Time", "EARFQUAKE", "Pink + White", "Love Galore", "R U Mine?"],
  },
  {
    owner: "theo", title: "Best Hip-Hop Beats of the 2010s (from this catalogue)", description: "Ranked strictly on production.", ranked: true,
    songs: [["Alright", "Pharrell and Sounwave at their peak."], "Runaway", "King Kunta", "Power", "Devil in a New Dress", "These Walls", "EARFQUAKE", "Monster", "Wesley's Theory", "NEW MAGIC WAND"],
  },
  {
    owner: "ellis", title: "Shoegaze Starter Pack", description: "Turn it up. No, louder.", ranked: true,
    songs: ["Only Shallow", "Alison", "When You Sleep", "When the Sun Hits", "Soon", "To Here Knows When", "40 Days", "Sometimes", "Souvlaki Space Station", "Machine Gun"],
  },
  {
    owner: "rosa", title: "Songs That Changed My Life", description: "In the order they found me.", ranked: true,
    songs: [["Skinny Love", "Winter 2012. Everything was different after."], "Songbird", "Garden Song", "I Know the End", "Two Slow Dancers", "Re: Stacks", "Moon Song", "A Pearl"],
  },
  {
    owner: "sam", title: "Perfect Gym Songs", description: "BPM-tested.", ranked: false,
    songs: ["Harder, Better, Faster, Stronger", "Power", "360", "Club classics", "King Kunta", "R U Mine?", "Aerodynamic", "Von dutch", "Monster", "Let It Happen", "B2b"],
  },
  {
    owner: "priya", title: "Songs That Sound Like Summer", description: "Warm, hazy, a bit nostalgic.", ranked: false,
    songs: ["Pink + White", "Sweet Life", "Space Song", "Digital Love", "Dreams", "Something About Us", "The Less I Know the Better", "Supermodel", "Kyoto", "Wildflower"],
  },
  {
    owner: "noor", title: "Late Night Jazz & Ambient", description: "For reading, rain and insomnia.", ranked: false,
    songs: ["Blue in Green", "Flamenco Sketches", "Xtal", "Ageispolis", "Nude", "Videotape", "So What", "Re: Stacks", "Veridis Quo"],
  },
  {
    owner: "kai", title: "Best Kanye West Songs", description: "From MBDTF, because that's what's here. Still correct.", ranked: true,
    songs: ["Runaway", "Power", "Devil in a New Dress", "All of the Lights", "Monster", "Gorgeous", "Blame Game", "Lost in the World", "Dark Fantasy", "So Appalled"],
  },
  {
    owner: "juno", title: "Duets & Features That Stole the Song", description: "When the guest walks in and owns the room.", ranked: false,
    songs: [["Pink Matter @ Frank Ocean", "André 3000 doing André 3000 things."], "Doves in the Wind", "Monster", "Super Rich Kids", "Love Galore", "Halloween", "Solo (Reprise)", "EARFQUAKE"],
  },
];

export const TAG_POOL = ["late-night", "summer", "nostalgic", "gym", "study", "party", "rainy", "commute", "heartbreak", "headphones", "driving", "sunday"];
