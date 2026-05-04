export type Track = {
  title: string;
  album: string;
  year: number;
  description: string;
};

export type QA = {
  q: string;
  a: string;
};

export type RelatedLink = {
  label: string;
  url: string;
};

export type Band = {
  id: string;
  name: string;
  reading: string;
  formedYear: number;
  origin: string;
  members: string[];
  genres: string[];
  tagline: string;
  hero: {
    gradientFrom: string;
    gradientTo: string;
    accent: string;
  };
  bio: string;
  interview: QA[];
  tracks: Track[];
  links: RelatedLink[];
};

export const BANDS: Band[] = [
  {
    id: "moonlit-static",
    name: "Moonlit Static",
    reading: "ムーンリット・スタティック",
    formedYear: 2019,
    origin: "東京都・下北沢",
    members: ["蒼井 凛 (Vo/Gt)", "中野 ハル (Ba)", "三上 蓮 (Dr)"],
    genres: ["Shoegaze", "Dream Pop", "Indie"],
    tagline: "夜の街を溶かすノイズと甘いメロディの三人組。",
    hero: {
      gradientFrom: "from-indigo-900",
      gradientTo: "to-fuchsia-700",
      accent: "text-fuchsia-300",
    },
    bio: "下北沢のライブハウスで結成された3人組。轟音のギターと囁くようなボーカルが交差するサウンドで、Slowdive や My Bloody Valentine の系譜を継ぎつつも、現代の都市の孤独を描き出す。2023年リリースの 1st EP『Velvet Static』は SNS で話題を呼び、各地のフェスに出演。",
    interview: [
      {
        q: "バンド名の由来を教えてください。",
        a: "深夜にラジオから流れるホワイトノイズが、月明かりに照らされた部屋にずっと残っていた感じ。あの夜の空気をそのまま閉じ込めたくて、Moonlit Static にしました。",
      },
      {
        q: "曲作りで一番大事にしていることは？",
        a: "「音の壁の向こうから声が聴こえる」感覚です。歌詞は耳元で囁いてるくらいの距離なのに、ギターはずっと遠くで鳴っている。その距離感が私たちの世界観だと思っています。",
      },
      {
        q: "ライブでお客さんに伝えたいことは？",
        a: "うるさいけど、優しい。ぐしゃぐしゃに溶けて、終わったあとに少しだけ世界が柔らかく見えるような時間にしたいです。",
      },
    ],
    tracks: [
      {
        title: "Velvet Static",
        album: "Velvet Static EP",
        year: 2023,
        description: "代表曲。ノイズの奥でループするコーラスが切ない、6分半の没入トラック。",
      },
      {
        title: "Neon Lullaby",
        album: "Velvet Static EP",
        year: 2023,
        description: "深夜のコンビニ前で聴きたくなる、ミドルテンポのドリームポップ。",
      },
      {
        title: "Glow / 焔",
        album: "Single",
        year: 2024,
        description: "アコースティックギターから轟音へ展開する、ライブの定番クライマックス曲。",
      },
    ],
    links: [
      { label: "Official Site", url: "#" },
      { label: "Bandcamp", url: "#" },
      { label: "X (旧Twitter)", url: "#" },
    ],
  },
  {
    id: "kyoto-overdrive",
    name: "京都オーバードライブ",
    reading: "きょうとオーバードライブ",
    formedYear: 2016,
    origin: "京都府・木屋町",
    members: ["藤原 太一 (Vo/Gt)", "佐久間 葵 (Gt)", "森田 凪 (Ba)", "黒木 樹 (Dr)"],
    genres: ["Math Rock", "Post-Rock", "Emo"],
    tagline: "鴨川の風に変拍子を乗せて鳴らす、関西エモの新基準。",
    hero: {
      gradientFrom: "from-emerald-900",
      gradientTo: "to-amber-700",
      accent: "text-amber-300",
    },
    bio: "京都の大学サークルで結成された4人組。タッピングを多用する複雑なギターワークと、感情をむき出しにする日本語詞のコントラストが特徴。toe や tricot の影響を公言しつつ、自分たちなりの「鴨川の景色のような」音像を追求している。",
    interview: [
      {
        q: "京都というロケーションは音に影響していますか？",
        a: "むちゃくちゃ影響してます。東京みたいに常にうるさい街じゃなくて、夜になると本当に静かになる。その「間」がリフの隙間に入ってきている気がします。",
      },
      {
        q: "変拍子を多用する理由は？",
        a: "気持ちって 4/4 で割り切れないじゃないですか。喜んでるのか怒ってるのかわかんない感情を、9/8 とか 7/8 で表現してます。難しいことやってるつもりはなくて、必要だからそうなってる。",
      },
      {
        q: "今後の目標は？",
        a: "海外のマスロック勢と一緒にツアーがしたい。京都から世界へ、ベタですけど本気です。",
      },
    ],
    tracks: [
      {
        title: "鴨川 7/8",
        album: "夜想曲集",
        year: 2022,
        description: "7/8 拍子のタッピングリフが印象的な代表曲。後半の轟音パートは必聴。",
      },
      {
        title: "木屋町ブルース",
        album: "夜想曲集",
        year: 2022,
        description: "唯一のミドルテンポ曲。歌モノとしての強度を見せつける一曲。",
      },
      {
        title: "Overdrive Kyoto",
        album: "Single",
        year: 2024,
        description: "バンドの新章を告げる、9分超えのインスト大作。",
      },
    ],
    links: [
      { label: "Official Site", url: "#" },
      { label: "YouTube", url: "#" },
      { label: "Instagram", url: "#" },
    ],
  },
  {
    id: "haze-ghost-club",
    name: "Haze Ghost Club",
    reading: "ヘイズ・ゴースト・クラブ",
    formedYear: 2021,
    origin: "大阪府・南堀江",
    members: ["RIN (Vo)", "Kou (Synth/Prog)", "Mei (Dr)"],
    genres: ["Synthwave", "Electro Pop", "City Pop Revival"],
    tagline: "80sの夢と令和のメランコリーを混ぜ合わせるエレクトロ三人組。",
    hero: {
      gradientFrom: "from-pink-700",
      gradientTo: "to-cyan-600",
      accent: "text-cyan-300",
    },
    bio: "南堀江のクラブシーンから現れた3人組。アナログシンセとエッジの効いたドラムプログラミング、そして艶のあるボーカルが融合し、シティポップ・リバイバルの最先端として注目を集める。MV のビジュアルワークも自作で、レトロフューチャーな世界観を徹底している。",
    interview: [
      {
        q: "80年代サウンドに惹かれた理由は？",
        a: "私たち、誰もリアルタイムで知らないんですよ。だからこそ、写真や映画の中の「キラキラした未来」みたいな世界に憧れがある。手の届かない夢を、いま自分たちで作り直してる感覚です。",
      },
      {
        q: "ライブで重視していることは？",
        a: "観客と一緒に踊ること。座って聴くタイプの音楽じゃないので、フロアに降りていくこともあります。",
      },
      {
        q: "Haze（霞）という言葉について。",
        a: "都市の景色って、晴れてるときよりも霞んでるときのほうがロマンチックに見える。私たちの音楽も、輪郭をぼかすことで本当のことを描こうとしています。",
      },
    ],
    tracks: [
      {
        title: "Midnight Highway",
        album: "Neon Drive",
        year: 2023,
        description: "アーバンナイトドライブの定番。サビのシンセソロが圧巻。",
      },
      {
        title: "Polaroid",
        album: "Neon Drive",
        year: 2023,
        description: "アコースティックなイントロから一転、ダンサブルに展開する切ないラブソング。",
      },
      {
        title: "Ghost in Osaka",
        album: "Single",
        year: 2025,
        description: "大阪の街をゴースト視点で描いた、最新シングル。MV は全編フィルム撮影。",
      },
    ],
    links: [
      { label: "Official Site", url: "#" },
      { label: "Spotify", url: "#" },
      { label: "TikTok", url: "#" },
    ],
  },
  {
    id: "iron-tide",
    name: "IRON TIDE",
    reading: "アイアン・タイド",
    formedYear: 2014,
    origin: "神奈川県・横浜",
    members: ["Jun (Vo)", "Daiki (Gt)", "Sho (Ba)", "Ren (Dr)"],
    genres: ["Hardcore", "Metalcore", "Post-Hardcore"],
    tagline: "港町の鉄錆と海風で鍛えられた、轟音ハードコアの重戦車。",
    hero: {
      gradientFrom: "from-zinc-800",
      gradientTo: "to-red-700",
      accent: "text-red-400",
    },
    bio: "横浜のスケートシーンから派生したハードコアバンド。10年以上アンダーグラウンドで活動を続け、近年その重く骨太なサウンドが再評価されている。歌詞には労働や街への愛、怒り、連帯がストレートに刻まれ、ライブのモッシュは伝説的。",
    interview: [
      {
        q: "10年続けてこられた理由は？",
        a: "辞める理由がなかった、それだけ。バンドは仕事じゃなくて生活なんで。明日も働きながら、また来週スタジオ入る。それの繰り返し。",
      },
      {
        q: "歌詞のテーマについて。",
        a: "綺麗事は書きたくない。汗かいて働いてる奴ら、ちゃんと生きてる奴らに刺さるものを書く。それだけです。",
      },
      {
        q: "ライブに来る人に伝えたいことは？",
        a: "暴れてくれ。でも隣の奴を踏むな。倒れた奴は起こせ。ハードコアのルールはそれだけ。",
      },
    ],
    tracks: [
      {
        title: "Salt of the Earth",
        album: "Harbor",
        year: 2021,
        description: "港湾労働者へのレクイエムとして書かれた、バンドのアンセム。",
      },
      {
        title: "Rust",
        album: "Harbor",
        year: 2021,
        description: "2分半に詰め込まれた、初期衝動むき出しの最速ナンバー。",
      },
      {
        title: "TIDE / 潮",
        album: "Single",
        year: 2024,
        description: "8分の大曲。後半の大合唱パートはライブで毎回鳥肌もの。",
      },
    ],
    links: [
      { label: "Official Site", url: "#" },
      { label: "Bandcamp", url: "#" },
      { label: "Instagram", url: "#" },
    ],
  },
];

export function getBand(id: string): Band | undefined {
  return BANDS.find((b) => b.id === id);
}

export function getBandIndex(id: string): number {
  return BANDS.findIndex((b) => b.id === id);
}
