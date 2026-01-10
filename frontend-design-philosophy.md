---
description: Modern Korean Web App Frontend Design Philosophy (AI-Agent Friendly)
---

# 🎨 프론트엔드 디자인 철학 가이드

> AI 에이전트가 일관된 디자인을 구현할 수 있도록 작성된 가이드입니다.

---

## 1. 디자인 시스템 핵심 원칙

### 1.1 토스(Toss) 스타일 컬러 시스템

```css
/* 라이트 모드 */
--background: #F2F4F6;      /* 부드러운 회색 배경 */
--foreground: #191F28;      /* 진한 검정 텍스트 */
--primary: #3182F6;         /* 토스 블루 - 주요 액션 */
--muted: #F2F4F6;           /* 비활성 배경 */
--muted-foreground: #8B95A1;/* 보조 텍스트 */
--border: #E5E8EB;          /* 경계선 */
--card: #FFFFFF;            /* 카드 배경 */

/* 다크 모드 */
--background: #101013;      /* 딥 블랙 */
--foreground: #FFFFFF;
--card: #20202C;            /* 다크 카드 */
--muted: #17171C;
--border: #333D4B;
```

### 1.2 필수 규칙
- **항상 CSS 변수 사용**: `text-foreground`, `bg-background`, `border-border`
- **하드코딩 금지**: `text-white`, `bg-gray-100` 대신 테마 변수 사용
- **다크/라이트 모드 자동 대응**: 모든 색상은 테마에 따라 변경되어야 함

---

## 2. 타이포그래피

### 2.1 폰트 설정
```css
--font-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
```

### 2.2 텍스트 스타일
| 용도 | 클래스 |
|------|--------|
| 페이지 제목 | `text-3xl font-extrabold tracking-tight` |
| 섹션 제목 | `text-xl font-bold` |
| 카드 제목 | `text-[17px] font-bold leading-snug` |
| 본문 | `text-[15px] leading-relaxed` |
| 보조 텍스트 | `text-sm text-muted-foreground` |
| 아주 작은 텍스트 | `text-[11px] font-medium` |

---

## 3. 컴포넌트 스타일링

### 3.1 카드 컴포넌트
```tsx
<Card className="
  bg-card/80 
  backdrop-blur-md 
  rounded-[24px] 
  border border-border/50 
  shadow-lg 
  hover:shadow-xl 
  hover:border-primary/30 
  transition-all duration-300
">
```

**핵심 패턴:**
- `rounded-[24px]` - 큰 라운드 코너
- `backdrop-blur-md` - 글래스모피즘 효과
- `bg-card/80` - 반투명 배경
- `border-border/50` - 미묘한 경계선
- `shadow-lg hover:shadow-xl` - 호버 시 그림자 강화

### 3.2 버튼 스타일
```tsx
/* 주요 액션 버튼 */
<Button className="
  h-12 
  rounded-xl 
  font-bold 
  bg-primary 
  text-primary-foreground 
  shadow-lg shadow-primary/20 
  hover:shadow-primary/30 
  active:scale-[0.98] 
  transition-all
">

/* 고스트 버튼 */
<Button variant="ghost" className="
  rounded-full 
  hover:bg-muted 
  hover:scale-105 
  transition-transform
">
```

### 3.3 입력 필드
```tsx
<Input className="
  h-[52px] 
  rounded-[16px] 
  border border-border 
  bg-background 
  text-foreground 
  placeholder:text-muted-foreground 
  focus-visible:border-primary 
  focus-visible:ring-2 
  focus-visible:ring-primary/20 
  transition-all duration-200
">
```

### 3.4 탭/필터 버튼
```tsx
<div className="
  flex gap-1 p-1.5 
  bg-muted/60 
  rounded-full 
  border border-border/60 
  backdrop-blur-sm
">
  <button className={`
    px-4 py-2 
    rounded-full 
    text-sm font-bold 
    transition-colors
    ${isActive 
      ? 'bg-primary text-primary-foreground shadow-md' 
      : 'text-muted-foreground hover:text-foreground'}
  `}>
```

### 3.5 태그/뱃지
```tsx
/* 기본 태그 */
<span className="
  px-2.5 py-1 
  rounded-[10px] 
  bg-muted/50 
  text-muted-foreground 
  border border-border/50 
  text-[11px] font-semibold
">

/* 컬러 태그 (예: 장학금) */
<span className="
  px-2.5 py-1 
  rounded-[10px] 
  bg-blue-500/[0.05] 
  text-blue-600 dark:text-blue-400 
  border border-blue-200/50 dark:border-blue-800/50 
  text-[11px] font-medium
">

/* 강조 태그 (예: 마감일) */
<span className="
  px-2.5 py-1 
  rounded-lg 
  bg-rose-500/[0.05] 
  text-rose-600 dark:text-rose-400 
  border border-rose-200/50 dark:border-rose-900/30 
  text-[11px] font-medium
">
```

---

## 4. 애니메이션 패턴 (Framer Motion)

### 4.1 페이지 진입 애니메이션
```tsx
<motion.div
  initial={{ opacity: 0, y: 30 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ 
    duration: 0.6, 
    ease: [0.22, 1, 0.36, 1]  // 커스텀 이징 (느리게 시작, 빠르게 끝)
  }}
>
```

### 4.2 리스트 아이템 스태거 애니메이션
```tsx
<motion.div
  initial={{ opacity: 0, y: 30, scale: 0.95 }}
  whileInView={{ opacity: 1, y: 0, scale: 1 }}
  viewport={{ once: true, margin: "-50px" }}
  transition={{
    duration: 0.5,
    delay: index * 0.05,  // 순차적 등장
    ease: [0.22, 1, 0.36, 1]
  }}
>
```

### 4.3 호버 효과
```tsx
<motion.div
  whileHover={{ 
    y: -4,
    transition: { duration: 0.2 }
  }}
  whileTap={{ scale: 0.95 }}
>
```

### 4.4 탭 전환 (layoutId)
```tsx
{isActive && (
  <motion.span
    layoutId="activeTab"
    className="absolute inset-0 bg-primary rounded-full -z-10 shadow-md"
    transition={{ type: "spring", stiffness: 400, damping: 30 }}
  />
)}
```

### 4.5 AnimatePresence (조건부 렌더링)
```tsx
<AnimatePresence mode="wait">
  {isLoading ? (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <LoadingSpinner />
    </motion.div>
  ) : (
    <motion.div
      key="content"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      {content}
    </motion.div>
  )}
</AnimatePresence>
```

---

## 5. 고급 효과

### 5.1 3D 틸트 카드 효과
```tsx
// TiltCard 컴포넌트 사용
<TiltCard className="...">
  <CardContent />
</TiltCard>

// 구현 핵심
const rotateX = useTransform(mouseY, [-0.5, 0.5], ["8deg", "-8deg"]);
const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-8deg", "8deg"]);

<motion.div style={{ 
  rotateX, 
  rotateY, 
  transformStyle: "preserve-3d" 
}}>
  {/* 글래어 효과 */}
  <div style={{
    background: `radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.15), transparent 60%)`
  }} />
  
  {/* 컨텐츠 (Z축으로 띄우기) */}
  <div style={{ transform: "translateZ(30px)" }}>
    {children}
  </div>
</motion.div>
```

### 5.2 스크롤 반응형 네비게이션
```tsx
const { scrollY } = useScroll();
const padding = useTransform(scrollY, [0, 100], [24, 12]);
const logoScale = useTransform(scrollY, [0, 100], [1, 0.9]);

<motion.nav
  style={{ paddingTop: padding, paddingBottom: padding }}
  className={cn(
    "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
    isScrolled
      ? "bg-background/70 backdrop-blur-xl border-b border-border/40 shadow-lg"
      : "bg-transparent"
  )}
>
```

### 5.3 글래스모피즘 카드
```tsx
<div className="
  bg-card/80 
  backdrop-blur-md 
  border border-border/50 
  shadow-lg
">
```

### 5.4 그라데이션 텍스트
```tsx
<span className="
  font-bold 
  bg-gradient-to-r from-blue-600 via-purple-600 to-red-500 
  bg-clip-text text-transparent
">
  AI 요약
</span>
```

---

## 6. 로딩 상태

### 6.1 전체 화면 로딩
```tsx
<div className="
  fixed inset-0 z-[9999] 
  flex flex-col items-center justify-center 
  bg-background/80 backdrop-blur-md
">
  <motion.div
    animate={{ rotate: 360 }}
    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
    className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary"
  />
  <p className="mt-6 text-lg font-bold">✨ 로딩 중...</p>
</div>
```

### 6.2 버튼 로딩
```tsx
<Button disabled={isLoading}>
  {isLoading && (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground mr-2"
    />
  )}
  저장
</Button>
```

### 6.3 스켈레톤 로딩
```tsx
<motion.div
  className="h-4 bg-muted/50 rounded-md overflow-hidden"
>
  <motion.div
    className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
    animate={{ x: ['100%', '-100%'] }}
    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
  />
</motion.div>
```

---

## 7. 반응형 디자인

### 7.1 기본 브레이크포인트
| 브레이크포인트 | 용도 |
|---------------|-----|
| `md:` (768px) | 태블릿/데스크톱 전환점 |
| `lg:` (1024px) | 데스크톱 고급 기능 |

### 7.2 패턴
```tsx
/* 모바일 우선 */
<div className="
  flex flex-col 
  md:flex-row 
  gap-4 
  md:gap-6
">

/* 조건부 표시 */
<span className="hidden md:inline">데스크톱에서만 보임</span>
<span className="md:hidden">모바일에서만 보임</span>

/* 그리드 */
<div className="
  grid 
  grid-cols-1 
  md:grid-cols-2 
  lg:grid-cols-3 
  gap-4
">
```

---

## 8. 컨테이너 & 레이아웃

### 8.1 페이지 컨테이너
```tsx
<div className="min-h-screen font-sans bg-background text-foreground">
  <div className="min-h-screen p-4 md:p-8" style={{ paddingTop: '120px' }}>
    <main className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* 콘텐츠 */}
    </main>
  </div>
</div>
```

### 8.2 배경 이미지 + 오버레이
```tsx
<div className="bg-[url('/background.png')] bg-cover bg-center bg-fixed">
  <div className="min-h-screen bg-background/60 backdrop-blur-[20px]">
    {/* 콘텐츠 */}
  </div>
</div>
```

---

## 9. 모달/다이얼로그

```tsx
<DialogContent className="
  w-[95vw] md:w-[800px] 
  max-w-[95vw] md:max-w-[800px] 
  max-h-[90vh] 
  overflow-y-auto 
  rounded-[32px] 
  p-0 
  border-none 
  bg-card/95 
  backdrop-blur-xl 
  shadow-2xl
">
  {/* 스티키 헤더 */}
  <div className="
    sticky top-0 z-10 
    bg-card/80 backdrop-blur-md 
    p-6 border-b border-border/50
  ">
    <DialogTitle>제목</DialogTitle>
  </div>
  
  {/* 본문 */}
  <div className="p-6">
    {content}
  </div>
</DialogContent>
```

---

## 10. 체크리스트

새 컴포넌트 만들 때 확인:

- [ ] 모든 색상이 CSS 변수 사용하는가? (`text-foreground`, `bg-background`)
- [ ] 다크모드에서 테스트했는가?
- [ ] Framer Motion으로 진입 애니메이션 있는가?
- [ ] 호버/탭 상태가 정의되어 있는가?
- [ ] 라운드 코너가 일관적인가? (16px~32px)
- [ ] 모바일 반응형인가?
- [ ] 로딩 상태가 정의되어 있는가?

---

## 11. 필수 의존성

```json
{
  "framer-motion": "^11.x",
  "tailwindcss": "^4.x",
  "@radix-ui/react-*": "shadcn/ui 컴포넌트",
  "lucide-react": "아이콘",
  "lottie-react": "Lottie 애니메이션 (선택)",
  "next-themes": "다크모드 (선택)"
}
```

---

## 12. Quick Reference

```tsx
// 필수 임포트
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// 표준 이징
const easing = [0.22, 1, 0.36, 1];

// 표준 스프링
const spring = { type: "spring", stiffness: 400, damping: 30 };

// 표준 진입 애니메이션
const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: easing }
};

// 표준 호버
const hoverScale = {
  whileHover: { scale: 1.05 },
  whileTap: { scale: 0.95 }
};
```

---

*이 문서는 AI 에이전트가 일관된 디자인을 구현할 수 있도록 최적화되어 있습니다.*
