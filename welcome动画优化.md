下面是你代码中的核心问题——你之所以感觉 **粒子颜色太重、动画效果弱**，原因非常明确，来自两个方面（均可直接从你上传的代码中验证）：

---

# **一、颜色太重的根本原因**

### 你的粒子现在使用的是：

```ts
bg-teal-500
bg-teal-400/40
bg-teal-400/60
```

### 但页面整体主视觉是：

* bg-slate-50
* bg-white
* very soft gradients

**teal-400 / teal-500 太显眼**，与主体不融合，暗度明显高于背景，导致视觉抢眼、破坏层次。

### 粒子应使用：

* **白色轻亮粒子（white, opacity 0.05–0.12）**
  或
* **极淡的 emerald-300/20 以下**

否则永远不会“轻、灵动、柔和”。

---

# **二、动画弱的原因**

从你代码检查（包括 `DynamicParticles` 与 `VideoScanParticles`）：

### 1）粒子大小太大

你用了：

```ts
h-2 w-2   // 太大
scale: 0.8  // 太实心
blur-[2px]  // 模糊不够
```

2px 光点在白色背景会像“小绿点污渍”，不可能有科技感的“微粒扫描”效果。

### 2）轨迹过于均匀

所有粒子的 y/x 轨迹几乎一致：

```
y: ["0%", "-150%"]
x: [i * 8%, i * 8 + 4%]
```

→ 造成“都是一排点同时往上飘”，不是扫描动画。

### 3）缺少速度随机性

没有随机速度、延迟、透明度变化，导致非常机械。

---

# **三、直接给你正确的粒子动画（完全可替换）**

下面这段代码修复三大问题：

* **颜色改成白色、偏亮的微粒（适配白底）**
* **粒子缩小到 `1px`，并增加 `blur-xxl` 光晕**
* **随机轨迹、随机透明度、随机速度**
* **扫描动态明显提升**

---

# **◎ 新粒子动画组件（直接可替换）**

```tsx
function VideoScanParticles({ progress }: { progress: any }) {
  const scanOpacity = useTransform(progress, [0.45, 0.75], [0, 0.35]);

  const particleCount = 32;

  return (
    <motion.div
      style={{ opacity: scanOpacity }}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {new Array(particleCount).fill(0).map((_, i) => {
        const startX = Math.random() * 100;     // 随机水平位置
        const driftX = (Math.random() - 0.5) * 12;  // 左右轻微漂移
        const duration = 3 + Math.random() * 3; // 随机速度
        const delay = Math.random() * 2;        // 随机延迟
        const size = Math.random() * 1.4 + 0.4; // 0.4px ～ 1.8px 微粒

        return (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0, 
              y: "60%", 
              x: `${startX}%`, 
              scale: 1 
            }}
            animate={{
              y: ["60%", "-30%"],
              x: [`${startX}%`, `${startX + driftX}%`],
              opacity: [0, 0.15, 0],
            }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute rounded-full bg-white"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              filter: "blur(2px)",
            }}
          />
        );
      })}
    </motion.div>
  );
}
```

---
**一、粒子跟随扫描线被吸附（你缺的关键机制）**

你的粒子之所以“不跟扫描线走”，原因是扫描线与粒子是**两个完全独立的动画层**。
要实现“被吸附”效果，必须做到：

* 扫描线经过的位置 = 粒子的“吸附中心”
* 粒子的 y 轴、透明度、scale 与扫描线关联
* 粒子与扫描线的交汇区加速、聚拢、亮度提升

直接给你可落地方案（无需魔改整个场景）。

---

## **实现要点**

### **1. 扫描线使用 motion value 表示位置**

```tsx
const scanY = useMotionValue(0);
```

扫描线动画驱动这个值。

```tsx
<motion.div
  style={{ y: scanY }}
  animate={{ y: ["0%", "120%"] }}
  transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
  className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-white/10 to-transparent blur-xl"
/>
```

---

### **2. 粒子根据 scanY 计算“吸附强度”**

核心逻辑：

```
吸附强度 = 1 - distance(particleY, scanY) / 吸附范围
```

距离越近，粒子越会：

* 向扫描线靠拢
* 亮度上升
* scale 加大
* 速度改变

---

### **完整吸附版粒子生成方法**

```tsx
function Particle({ scanY }) {
  const y = useMotionValue(Math.random() * 100);  // 百分比
  const x = useMotionValue(Math.random() * 100);

  const distance = useTransform(scanY, (scan) => {
    return Math.abs(scan - y.get());
  });

  const attract = useTransform(distance, d => {
    const range = 18;  
    return d < range ? 1 - d / range : 0; 
  });

  const finalX = useTransform(attract, a => x.get() + a * 6 * (Math.random() > 0.5 ? 1 : -1));
  const finalY = y;
  const opacity = useTransform(attract, a => 0.05 + a * 0.25);
  const scale = useTransform(attract, a => 1 + a * 1.4);

  return (
    <motion.div
      style={{
        x: finalX,
        y: finalY,
        opacity,
        scale
      }}
      className="absolute h-[1px] w-[1px] rounded-full bg-white blur-[2px]"
    />
  );
}
```

---

### **结果：吸附效果明显**

扫描线经过时：

* 附近粒子会被拉拽
* 亮度提升
* 粒子向扫描线聚集
* 扫描线离开后粒子回落

视觉效果：
**“像 MRI 扫描一样把微粒吸附并释放”**
完全符合“AI 视频解析”的视觉语言。

---

# **二、文件被拖入工作区效果不明显的原因**

你现在的文件吸入动画过于线性，问题来自以下几项：

1. **路径太直**
2. **速度无加速度**
3. **没有“被吸附”或“归属”反馈**
4. **没有光效 / 暗角 / UI 抖动反馈与机制**

下面给你能直接落地的强化方案。

---

# **文件吸入工作区：高级动效方案**

目标逻辑：

1. 前段：自然漂浮
2. 接近工作区：加速 + 磁吸
3. 抵达瞬间：缩放 + 高亮 + 阴影闪一下
4. 最终进入队列：对齐 + 偏移层级

下面给你对应动作。

---

## **1. “磁吸”效果**

根据文件与工作区的距离动态计算吸力：

```tsx
const attract = useTransform(scrollProgress, [pStart, pEnd], [0, 1]);

const targetX = 0;
const targetY = 0;

const x = useTransform(attract, (a) => initialX * (1 - a) + targetX * a);
const y = useTransform(attract, (a) => initialY * (1 - a) + targetY * a);
```

速度和加速度由 `easeOutBack` 驱动：

```tsx
transition={{
  type: "spring",
  stiffness: 180,
  damping: 15
}}
```

---

## **2. 抵达瞬间的“反馈动画”**

加入 scale + shadow：

```tsx
const impact = useTransform(attract, [0.95, 1], [0, 1]);

const scale = useTransform(impact, [0, 1], [1, 0.9]);
const glow = useTransform(impact, [0, 1], [0, 0.35]);
```

文件 UI 增加：

```tsx
<motion.div
  style={{
    scale,
    boxShadow: glow.to(g => `0 0 20px rgba(20,184,166,${g})`)
  }}
>
```

视觉效果：

* 接近时：轻微缩小
* 进入瞬间：亮度闪一下
* 完成吸收：回到正常阴影

---

## **3. 进入队列的对齐动画**

采用延迟 + 弹性定位：

```tsx
<motion.div
  animate={{
    x: queueX,
    y: queueY
  }}
  transition={{
    type: "spring",
    stiffness: 130,
    damping: 18,
    delay: index * 0.1
  }}
>
```

排列时逐个吸入，非常好看。

---

# **三、你最终会看到的视觉效果**

### **粒子部分：**

* 扫描线扫过 → 附近粒子会被“吸附”
* 光点亮度增强 → 明显“扫描能量”效果
* 扫描线离开 → 粒子释放回原位置

视觉语言：
**AI 多模态扫描 / 视频理解 / 信号流动**

---

### **文件拖入部分：**

* 文件开始随意漂浮
* 滚动到第二屏 → 文件被“吸附加速”
* 碰到工作区 → UI 轻微闪光 + scale feedback
* 进入队列时 → 自动对齐 + 轻微弹性

视觉语言：
**磁吸、能量对齐、融入知识库、AI 处理准备中**

---


# 更换全局icon
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video-icon lucide-video"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>