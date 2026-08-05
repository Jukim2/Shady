const asset = (folder, file) =>
  new URL(`../../../output/${folder}/${file}`, import.meta.url).href;
const targetAsset = (file) =>
  new URL(`../../../assets/targets/${file}`, import.meta.url).href;

const createLevel = ({ id, folder, target, category, order, title, subtitle, difficulty, start, lightMode = "directional", dual = false }) => ({
  id,
  folder,
  category,
  order,
  title,
  subtitle,
  difficulty,
  start,
  lightMode,
  assets: {
    model: asset(folder, "model.obj"),
    target: targetAsset(target),
    preview: asset(folder, "player_view.png"),
    ...(dual ? { targetSecondary: asset(folder, "target_secondary.png") } : {}),
  },
});

export const categories = [
  {
    id: "silhouette",
    number: "01",
    title: "첫 그림자",
    kicker: "SILHOUETTE",
    description: "낯선 형태를 돌려 익숙한 그림자를 찾아보세요.",
    accent: "#f06b42",
  },
  {
    id: "structure",
    number: "02",
    title: "구조 연구소",
    kicker: "STRUCTURE",
    description: "막대와 곡면 사이에 숨은 정확한 각도를 찾습니다.",
    accent: "#397b72",
  },
  {
    id: "light",
    number: "03",
    title: "빛의 변주",
    kicker: "LIGHT & SPACE",
    description: "가림과 이중광이 만드는 조금 더 까다로운 퍼즐입니다.",
    accent: "#6a5a9f",
  },
];

export const levels = [
  createLevel({ id: "A_cat_blocks", folder: "a_cat_blocks", target: "cat.png", category: "silhouette", order: 1, title: "고양이", subtitle: "Block Study", difficulty: 1, start: [52, -34, 72] }),
  createLevel({ id: "B_bird_organic", folder: "b_bird_organic", target: "bird.png", category: "silhouette", order: 2, title: "새", subtitle: "Organic Curve", difficulty: 1, start: [-42, 58, -64] }),
  createLevel({ id: "C_elephant_ribbon", folder: "c_elephant_ribbon", target: "elephant.png", category: "silhouette", order: 3, title: "코끼리", subtitle: "Folded Ribbon", difficulty: 2, start: [68, 38, 92] }),
  createLevel({ id: "D1_fish_disc_rod", folder: "d1_fish_disc_rod", target: "fish.png", category: "structure", order: 1, title: "물고기", subtitle: "Disc & Rod", difficulty: 2, start: [-62, 46, 105] }),
  createLevel({ id: "D2_horse_tubular", folder: "d2_horse_tubular", target: "horse.png", category: "structure", order: 2, title: "말", subtitle: "Tubular Frame", difficulty: 2, start: [78, -48, -88] }),
  createLevel({ id: "D3_cat_ribs", folder: "d3_cat_ribs", target: "cat.png", category: "structure", order: 3, title: "고양이 II", subtitle: "Rounded Ribs", difficulty: 3, start: [-76, -44, 112] }),
  createLevel({ id: "E_teapot_stack", folder: "e_teapot_stack", target: "teapot.png", category: "light", order: 1, title: "주전자", subtitle: "Occlusion Stack", difficulty: 3, start: [82, 52, -98], lightMode: "point" }),
  createLevel({ id: "F_elephant_dual", folder: "f_elephant_dual", target: "elephant.png", category: "light", order: 2, title: "코끼리 II", subtitle: "Dual Light", difficulty: 3, start: [-68, 62, 118], lightMode: "dual", dual: true }),
];

export const levelsByCategory = (categoryId) => levels.filter((level) => level.category === categoryId);
export const getLevel = (levelId) => levels.find((level) => level.id === levelId);
export const getCategory = (categoryId) => categories.find((category) => category.id === categoryId);
