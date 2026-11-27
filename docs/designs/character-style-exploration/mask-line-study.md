# 焦土迷宫主角面具彩色纹样方案

The end · 2026-11-24 · 设计草案

本页用于比较十款面具和头罩的配色、造型与表面纹样。统一使用接近战斗机位的头肩视角，头部按常人的比例绘制，眉眼和嘴由面具或罩布遮住。以水粉色块、细笔触与薄涂纸纹表现哑光表面，各款配色为选型建议。每款将一个西方神话意象画在额片、颧侧、下颌或罩布边缘，纹样沿面具的弧面和接缝变化。

| 编号 | 方案 | 灵感 | 造型与纹样 |
| --- | --- | --- | --- |
| 01 | 引线 | 阿里阿德涅 | 蓝灰与象牙白。颧侧一笔细金线绕过两个转角，沿面具的叠边走。 |
| 02 | 三岔 | 赫卡忒 | 暗青与烟紫。三道细铜色纹线从眉间分岔，顺着三块护片走。 |
| 03 | 渡口 | 卡戎 | 深靛与旧银。靠近下颌卷边画两条短水纹，像船舷划过水面。 |
| 04 | 裂籽 | 珀耳塞福涅 | 骨白与暗红。裂口旁有三颗小而克制的种子形绘纹。 |
| 05 | 隐檐 | 哈迪斯的隐身盔 | 墨蓝与深紫。檐下四道细线向暗处逐渐断开。 |
| 06 | 月弧 | 塞勒涅 | 月白与冷靛。颧侧描三道渐短的银白细月弧。 |
| 07 | 一目 | 奥丁 | 烟紫与冷青灰。单侧凹口外画两道不闭合的水纹，取意密米尔之泉。 |
| 08 | 两界 | 赫尔 | 粉灰与墨黑。分界两侧各有一小段断裂的细纹，跟着折面起伏。 |
| 09 | 三叠 | 诺恩 | 灰紫与灰蓝。在窄叠边上画三股交错的浅银线，像一小段编织。 |
| 10 | 雾纹 | 尼福尔海姆 | 雾蓝与青灰。颧骨上的三道细弧从紧到松，像雾沿着面具散开。 |

[阿里阿德涅线团](https://www.theoi.com/Text/ApEa.html) · [赫卡忒的三重造型](https://www.theoi.com/Khthonios/Hekate.html) · [卡戎与渡口](https://www.theoi.com/Text/VirgilAeneid6.html) · [珀耳塞福涅与石榴](https://chs.harvard.edu/primary-source/homeric-hymn-to-demeter-sb/) · [哈迪斯的隐身盔](https://www.theoi.com/Text/Apollodorus2.html) · [北欧神话《欺骗古鲁菲》](https://en.wikisource.org/wiki/The_Prose_Edda_%281916_translation_by_Arthur_Gilchrist_Brodeur%29/Gylfaginning)

彩稿位于 `art-source/ashen-labyrinth/face-covering-concepts-20261124/mythology-patterns-01-10.png`，由内置 `image_gen` 生成，提示词位于 `art-source/ashen-labyrinth/face-covering-concepts-20261124/mythology-patterns-01-10.prompt.txt`。面具与头部朝向、肩线及重心的动作关系待选型后细化，相关表现入口为 `assets/game/presentation/GameDirector.ts` 和 `assets/game/presentation/actors/ActorPresentation.ts`。

## 11 隐者提灯

以塔罗牌《隐者》里的灯和手杖为意象。雾蓝面具的颧侧画一盏旧金色小提灯，提灯下方的一条折线沿面具走向下颌，像被灯照出的路。眉眼和嘴由面具遮住。暖金纹样落在冷灰蓝的水粉色面上，保留薄涂纸纹。 [韦特《塔罗图解》的隐者页](https://en.wikisource.org/wiki/Page%3AThe_Pictorial_Key_to_the_Tarot.pdf/117)

单张彩稿位于 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask.png`，由内置 `image_gen` 生成。完整提示词位于 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask.prompt.txt`。

### 隐者提灯修订稿

将提灯的斜檐与窗框做进耳前面具的轮廓。短斜檐下方有一处可见的内收转折，梯形凹窗嵌入颧侧，窗下的旧金细线沿面具落向下颌。雾蓝壳、暖色窗和檐下暗面合起来交代面具结构。用于选型。

前侧四分之三的小图对照使用相同裁切范围。96 像素高时可区分短檐和梯形窗，64 像素高时主要读到檐下暗边与窗的暖色形状。

彩稿位于 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v2.png`，用内置 `image_gen` 以首稿为底图修订。完整提示词在 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v2.prompt.txt`。

### 隐者提灯第三稿

缩短并收薄耳前的檐角，保留外缘的一处转折。颧侧的灯纹由窄金线勾勒，恢复首稿的一点暖白灯芯，灯下的细线沿蓝灰面具弧面落向下颌。本版的线条和色块以近看时的精细程度为先，用于选型。

同一裁切、同一尺寸下对照三稿。96 像素高时可看见耳前折角和灯芯亮点。64 像素高时主要读到折角和暖色点，灯的细线在大图阅读。

彩稿位于 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v3.png`，用内置 `image_gen` 以第二稿与首稿为参照修订。完整提示词在 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v3.prompt.txt`。

### 隐者提灯第四稿

以首稿为底图。整体保持完整而贴脸的侧脸轮廓，前额和面罩正面保留大块雾蓝。颧侧提灯略往正脸移，长金线沿下半面的斜向转折扫过下颌，由提灯旁收窄处逐渐展开。纹样集中在灯和路，灯芯保留一笔暖白。用于选型。

以同一头部范围与首稿作小图对照。96 像素高时仍可区分灯轮廓与下颌长弧，64 像素高时可读到暖色灯芯和长弧方向。

本地彩稿为 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v4.png`，使用内置 `image_gen` 修订。完整提示词在 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v4.prompt.txt`。

### 隐者提灯首稿额纹点缀

用户选定第一版作为底图。在画面右上、面具额缘内侧添一枚小四角星，配两笔斜向细纹。色相取颧侧提灯的旧金，控制图案面积，作为额侧点缀。该画面作为本轮选型稿。

本地彩稿为 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-forehead.png`，使用内置 `image_gen` 以第一版修订。完整提示词在 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-forehead.prompt.txt`。

### 隐者提灯首稿折角纹

用户反馈后重新以首稿为底。在画面右上额缘内侧画两道长短错开的旧金细线，顺着额片的角度转折。短线提前收笔，额纹作为贴边的小点缀。当前为选型稿。

本地彩稿为 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-folded-trim.png`，以首稿用内置 `image_gen` 作局部修订，完整提示词为 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-folded-trim.prompt.txt`。

### 隐者提灯首稿单弧额纹

按用户选择，右上额缘点缀为折角纹外侧较长的一道旧金弯弧。内侧短弧处恢复雾蓝面漆。使用内置 `image_gen` 对折角纹稿作局部修订。

本地彩稿为 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-single-arc.png`，完整提示词在 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-single-arc.prompt.txt`。

### 隐者提灯柔光灯芯

按用户反馈，以单弧额纹稿为底，将颧侧提灯内的浅色火芯轻轻晕染。火芯保有一小点暖白，中间的琥珀色向外柔和过渡。柔光效果为画面选型细节。

本地彩稿为 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-soft-flame.png`，使用内置 `image_gen` 局部修订。完整提示词在 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-soft-flame.prompt.txt`。

### 隐者提灯火芯二次晕染

按用户反馈，以柔光灯芯稿为底进一步化开尖形火芯，使灯框里的暖色光斑更圆润，亮处向暗金色边缘平滑过渡。

本地彩稿为 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-diffused-flame.png`，使用内置 `image_gen` 局部修订。完整提示词在 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-diffused-flame.prompt.txt`。

### 隐者提灯柔金耀光

根据用户反馈，将颧侧提灯的耀光收暗。灯窗里用暖金色连成一团柔光，边缘收成薄晕，去掉单独的亮点与火星。

本地彩稿为 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-gentle-radiance.png`，使用内置 `image_gen` 局部修订。完整提示词在 `art-source/ashen-labyrinth/face-covering-concepts-20261124/hermit-tarot-mask-v1-gentle-radiance.prompt.txt`。

十款比较页归档在 `viking://~/resources/projects/the-end/designs/character-style-exploration/mythology-patterns-01-10`，隐者首稿在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask`，第二稿在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask-v2`，第三稿在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask-v3`，第四稿在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask-v4`，首稿额纹点缀在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask-v1-forehead`，首稿折角纹在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask-v1-folded-trim`，单弧额纹在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask-v1-single-arc`，柔光灯芯稿在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask-v1-soft-flame`，火芯二次晕染稿在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask-v1-diffused-flame`，柔金耀光稿在 `viking://~/resources/projects/the-end/designs/character-style-exploration/hermit-tarot-mask-v1-gentle-radiance`。设计记录位于 `viking://~/resources/projects/the-end/designs/character-style-exploration/mask-line-study.md`。
