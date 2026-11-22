# 焦土迷宫 · 青年求生者三渲二战斗动作试样

项目为 The End。2026-11-20 制作，当前为独立 Cocos 场景的视觉评审稿。

## 造型与镜头

主角的脸型、发色、露在围巾上方的下颌和靛紫披风沿用角色设定。身体正面的颜色取自四分之三绘画底稿，背部取自已选三视图。脸、围巾、身体和衣摆有前后体积，双臂、手指和牌张使用独立的立体几何。自定义材质根据变形后的法线做三档柔和明暗，布面的碎色留在贴图里。

默认近景同时容纳眼神、右手和牌面。拖动可在默认机位左右约 25° 内观察前臂缩短、牌缘转窄和手臂遮挡，也可切至全身。发梢和披风细褶主要靠绘画表现，侧转较大时个别轮廓仍会显薄。

## 表演

入场时三张牌在胸前从同一点展开。思考待机周期为 3.4 秒，右手指节贴近下颌，左前臂横过胸腹、承接右肘。呼吸牵动头、肩和衣摆，牌在各自的位置轻轻起伏。

选中的牌先上浮，右肩前送，肘部展开，食指从弯曲转为伸直。左手同时向胸口下方收，让出前臂交错的位置。弹指触牌在第 0.44 秒，随后选中牌向前翻转飞出，另外两张留在原处。第 1.20 秒回到思考姿势。照明、格挡和回击各有独立的触点轨道。

## 复核与文件

原生场景为 `assets/SurvivorToonReview.scene`，带蒙皮和五段动画的模型为 `assets/ashen-survivor-toon/survivor.glb`。`painted.effect` 处理法线着色，`assets/game/presentation/actors/SurvivorToonReview.ts` 处理播放、点牌和镜头。制作入口为 `python -B tools/toon/build_survivor.py`，构建入口为 `node tools/pink.cjs build --project . --platform web-desktop --build-config build-survivor-toon.json`。

`preview/runtime-check.json` 保存实机点选、触点和飞行位移。`preview/survivor-toon.webm` 与 `preview/survivor-toon.gif` 来自原生场景。按键 1、2、3 对应从左至右的三张牌，V 切换机位。还可直接点胸前牌面，或使用底部的同名按钮。

本次 Web Desktop 导出通过。分别点击三张浮牌后，右手食指都碰到了对应牌面。离手后 0.12 秒，选中牌移动约 0.29 米，另外两张各自的位移为零。使用数字键出牌后，角色按正常速度完成动作并回到待机。还在 1024×768 下操作了全身、慢放和拖动机位。实机录像为每秒 24 帧，时长 4.83 秒，包含展牌、待机时的机位转动和两次不同的弹牌。

面部深度拟合使用 MediaPipe canonical face 参考拓扑，Apache 2.0 许可保存在 `tools/toon/reference/`。最终角色用本项目绘画贴图。战斗主流程接入和全周转身美术属于后续制作范围。[参考拓扑原始文件](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj)
