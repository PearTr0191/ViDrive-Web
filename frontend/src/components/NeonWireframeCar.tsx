import { mapSegment } from './segmentUtils'

type SegmentKey = 'sedan' | 'suv' | 'hatchback' | 'mpv' | 'ev'
type Powertrain = 'ICE' | 'HEV' | 'EV'

interface NeonWireframeCarProps {
  type?: string
  segment?: string
  opacity?: number
  className?: string
  theme?: 'dark' | 'light'
}

const NEON = '#00FFBD'
const NEON_DIM = 'rgba(0,255,189,0.35)'
const NEON_FAINT = 'rgba(0,255,189,0.08)'
const DARK_BG = '#0A0E14'
const LIGHT_BG = '#F8FAFC'
const ENGINE_CLR = '#FFB800'
const BRAKE_CLR = '#FF6B35'
const BATTERY_CLR = '#00FFBD'

function getPowertrain(type?: string): Powertrain {
  const t = (type || '').toUpperCase()
  if (t === 'EV') return 'EV'
  if (t === 'HEV') return 'HEV'
  return 'ICE'
}

function Wheel({ cx, cy, r = 26, showBrake = false, bgColor = '#0A0E14' }: { cx: number; cy: number; r?: number; showBrake?: boolean; bgColor?: string }) {
  const inner = r * 0.55
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} stroke={NEON} strokeWidth="1.2" fill="none" opacity="0.85" />
      <circle cx={cx} cy={cy} r={inner} stroke={NEON} strokeWidth="0.8" fill="none" opacity="0.6" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <line
          key={a}
          x1={cx}
          y1={cy - inner + 2}
          x2={cx}
          y2={cy + inner - 2}
          stroke={NEON}
          strokeWidth="0.7"
          opacity="0.5"
          transform={`rotate(${a} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r="3" fill={NEON} opacity="0.95" />
      {showBrake && (
        <g>
          <rect x={cx - 5} y={cy + 2} width={10} height={8} rx="1.5" fill={BRAKE_CLR} opacity="0.9" />
          <rect x={cx - 2.5} y={cy + 4} width={5} height={3.5} rx="0.8" fill={bgColor} opacity="0.7" />
        </g>
      )}
    </g>
  )
}

function GroundLine({ y = 248 }: { y?: number }) {
  return (
    <g opacity="0.3">
      <line x1="30" y1={y} x2="770" y2={y} stroke={NEON} strokeWidth="0.6" strokeDasharray="4 6" />
    </g>
  )
}

function EngineIndicator() {
  return (
    <g opacity="0.85">
      <rect x="175" y="196" width="75" height="22" rx="2" fill="none" stroke={ENGINE_CLR} strokeWidth="1" />
      <rect x="182" y="200" width="60" height="14" rx="1" fill="none" stroke={ENGINE_CLR} strokeWidth="0.7" />
      <path d="M 210 196 L 210 186 L 226 181" fill="none" stroke={ENGINE_CLR} strokeWidth="0.9" />
      <rect x="226" y="178" width="18" height="5" rx="1.5" fill="none" stroke={ENGINE_CLR} strokeWidth="0.7" />
      <circle cx="200" cy="207" r="5" fill="none" stroke={ENGINE_CLR} strokeWidth="0.7" />
      <circle cx="200" cy="207" r="1.8" fill={ENGINE_CLR} opacity="0.7" />
      <path d="M 250 205 L 265 202" fill="none" stroke={ENGINE_CLR} strokeWidth="0.7" strokeDasharray="3 2" />
      <text x="212" y="232" fill={ENGINE_CLR} fontSize="6.5" fontFamily="monospace" textAnchor="middle" opacity="0.65">
        ENGINE
      </text>
    </g>
  )
}

function BatteryIndicator() {
  return (
    <g opacity="0.85">
      <rect x="335" y="226" width="200" height="10" rx="2" fill="none" stroke={BATTERY_CLR} strokeWidth="1" />
      {[355, 380, 405, 430, 455, 480, 505].map((x) => (
        <line key={x} x1={x} y1="226" x2={x} y2="236" stroke={BATTERY_CLR} strokeWidth="0.6" opacity="0.5" />
      ))}
      <text x="435" y="252" fill={BATTERY_CLR} fontSize="6.5" fontFamily="monospace" textAnchor="middle" opacity="0.6">
        BATTERY
      </text>
    </g>
  )
}

function BrakeIndicator({ cx, cy, bgColor = '#0A0E14' }: { cx: number; cy: number; bgColor?: string }) {
  return (
    <g>
      <rect x={cx - 5} y={cy + 2} width={10} height={7} rx="1.5" fill={BRAKE_CLR} opacity="0.85" />
      <rect x={cx - 2.5} y={cy + 3.5} width={5} height={3} rx="0.8" fill={bgColor} opacity="0.6" />
    </g>
  )
}


/* ------------------------------------------------------------------ */
/*  Segment-specific body paths                                         */
/*  Coordinate system: viewBox 0 0 800 280, ground at y=248            */
/* ------------------------------------------------------------------ */

function SedanBody() {
  // Low, sleek 3-box proportions: long hood, distinct trunk, sloping shoulder
  const body = `
    M 155 248
    L 155 232 L 168 212 L 185 198
    C 220 192, 260 190, 300 190
    L 360 190
    C 390 188, 420 165, 460 162
    C 500 160, 530 162, 560 190
    L 640 190
    C 660 192, 675 205, 685 220
    L 695 235 L 700 248
    L 695 256 L 675 256 L 668 248
    C 665 248, 662 252, 660 252
    C 658 252, 655 248, 652 248
    L 230 248
    C 227 248, 224 252, 222 252
    C 220 252, 217 248, 215 248
    L 188 248
    L 182 256 L 162 256 L 155 248
    Z
  `
  const glass = `
    M 295 192
    C 320 186, 350 184, 380 184
    L 540 184
    C 555 184, 565 190, 575 190
    L 555 210
    C 530 208, 500 208, 470 208
    L 310 208
    C 300 208, 290 200, 295 192
    Z
  `
  return (
    <g>
      <path d={body} stroke={NEON} strokeWidth="1.4" fill="none" opacity="0.9" />
      <path d={glass} stroke={NEON} strokeWidth="0.9" fill={NEON_FAINT} opacity="0.45" />
      <line x1="360" y1="190" x2="360" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <line x1="640" y1="190" x2="640" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <path d="M 185 198 L 175 194 L 178 204 Z" fill={NEON} opacity="0.35" />
      <path d="M 695 235 L 702 230 L 698 240 Z" fill={NEON} opacity="0.35" />
    </g>
  )
}

function SuvBody() {
  // Tall greenhouse, upright rear, higher beltline
  const body = `
    M 148 248
    L 148 230 L 160 208 L 178 196
    C 215 190, 255 188, 295 188
    L 360 188
    C 385 186, 410 158, 450 154
    C 490 152, 520 154, 555 188
    L 660 188
    C 680 190, 695 205, 705 222
    L 712 238 L 715 248
    L 710 256 L 690 256 L 684 248
    C 681 248, 678 252, 676 252
    C 674 252, 671 248, 668 248
    L 230 248
    C 227 248, 224 252, 222 252
    C 220 252, 217 248, 215 248
    L 188 248
    L 182 256 L 162 256 L 155 248
    Z
  `
  const glass = `
    M 300 190
    C 325 184, 355 182, 385 182
    L 540 182
    C 560 182, 570 188, 580 188
    L 555 208
    C 530 206, 500 206, 470 206
    L 315 206
    C 305 206, 295 198, 300 190
    Z
  `
  return (
    <g>
      <path d={body} stroke={NEON} strokeWidth="1.4" fill="none" opacity="0.9" />
      <path d={glass} stroke={NEON} strokeWidth="0.9" fill={NEON_FAINT} opacity="0.45" />
      <line x1="360" y1="188" x2="360" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <line x1="660" y1="188" x2="660" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <path d="M 178 196 L 168 192 L 172 202 Z" fill={NEON} opacity="0.35" />
      <path d="M 712 238 L 720 233 L 716 243 Z" fill={NEON} opacity="0.35" />
      <line x1="430" y1="154" x2="430" y2="188" stroke={NEON} strokeWidth="0.8" opacity="0.5" />
      <line x1="600" y1="156" x2="600" y2="188" stroke={NEON} strokeWidth="0.8" opacity="0.5" />
      <line x1="430" y1="154" x2="600" y2="156" stroke={NEON} strokeWidth="0.8" opacity="0.5" />
    </g>
  )
}

function HatchbackBody() {
  // Compact, steep rear hatch, no trunk
  const body = `
    M 162 248
    L 162 232 L 175 214 L 192 200
    C 225 194, 255 192, 290 192
    L 350 192
    C 375 190, 395 162, 425 158
    C 455 156, 475 158, 500 192
    L 590 192
    C 610 194, 625 208, 635 222
    L 642 235 L 645 248
    L 640 256 L 620 256 L 614 248
    C 611 248, 608 252, 606 252
    C 604 252, 601 248, 598 248
    L 230 248
    C 227 248, 224 252, 222 252
    C 220 252, 217 248, 215 248
    L 192 248
    L 186 256 L 166 256 L 160 248
    Z
  `
  const glass = `
    M 290 194
    C 315 188, 345 186, 375 186
    L 490 186
    C 510 186, 520 192, 530 192
    L 510 210
    C 485 208, 455 208, 425 208
    L 305 208
    C 295 208, 285 200, 290 194
    Z
  `
  return (
    <g>
      <path d={body} stroke={NEON} strokeWidth="1.4" fill="none" opacity="0.9" />
      <path d={glass} stroke={NEON} strokeWidth="0.9" fill={NEON_FAINT} opacity="0.45" />
      <line x1="350" y1="192" x2="350" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <line x1="590" y1="192" x2="590" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <path d="M 192 200 L 182 196 L 186 206 Z" fill={NEON} opacity="0.35" />
      <path d="M 642 235 L 650 230 L 646 240 Z" fill={NEON} opacity="0.35" />
    </g>
  )
}

function MvpBody() {
  // Tall, boxy, long flat roof, sliding-door hints
  const body = `
    M 140 248
    L 140 230 L 152 210 L 170 198
    C 205 192, 245 190, 285 190
    L 360 190
    C 385 188, 410 162, 450 158
    C 490 156, 520 158, 555 190
    L 660 190
    C 680 192, 695 208, 705 224
    L 712 238 L 715 248
    L 710 256 L 690 256 L 684 248
    C 681 248, 678 252, 676 252
    C 674 252, 671 248, 668 248
    L 230 248
    C 227 248, 224 252, 222 252
    C 220 252, 217 248, 215 248
    L 185 248
    L 178 256 L 158 256 L 152 248
    Z
  `
  const glass = `
    M 295 192
    C 320 186, 350 184, 380 184
    L 540 184
    C 560 184, 570 190, 580 190
    L 555 210
    C 530 208, 500 208, 470 208
    L 310 208
    C 300 208, 290 200, 295 192
    Z
  `
  return (
    <g>
      <path d={body} stroke={NEON} strokeWidth="1.4" fill="none" opacity="0.9" />
      <path d={glass} stroke={NEON} strokeWidth="0.9" fill={NEON_FAINT} opacity="0.45" />
      <line x1="360" y1="190" x2="360" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <line x1="660" y1="190" x2="660" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <line x1="290" y1="190" x2="290" y2="248" stroke={NEON} strokeWidth="0.5" opacity="0.2" />
      <line x1="480" y1="190" x2="480" y2="248" stroke={NEON} strokeWidth="0.5" opacity="0.2" />
      <path d="M 170 198 L 160 194 L 164 204 Z" fill={NEON} opacity="0.35" />
      <path d="M 712 238 L 720 233 L 716 243 Z" fill={NEON} opacity="0.35" />
    </g>
  )
}

function EvBody() {
  // Smooth, rounded nose; no grille; flush greenhouse
  const body = `
    M 165 248
    C 175 235, 180 218, 190 205
    C 210 196, 240 192, 275 190
    L 360 190
    C 385 188, 410 162, 450 158
    C 490 156, 515 158, 550 190
    L 640 190
    C 660 192, 675 206, 685 222
    L 692 236 L 695 248
    L 690 256 L 670 256 L 664 248
    C 661 248, 658 252, 656 252
    C 654 252, 651 248, 648 248
    L 230 248
    C 227 248, 224 252, 222 252
    C 220 252, 217 248, 215 248
    L 195 248
    L 188 256 L 168 256 L 162 248
    Z
  `
  const glass = `
    M 290 192
    C 315 186, 345 184, 375 184
    L 535 184
    C 555 184, 565 190, 575 190
    L 550 210
    C 525 208, 495 208, 465 208
    L 305 208
    C 295 208, 285 200, 290 192
    Z
  `
  return (
    <g>
      <path d={body} stroke={NEON} strokeWidth="1.4" fill="none" opacity="0.9" />
      <path d={glass} stroke={NEON} strokeWidth="0.9" fill={NEON_FAINT} opacity="0.45" />
      <line x1="360" y1="190" x2="360" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <line x1="640" y1="190" x2="640" y2="248" stroke={NEON} strokeWidth="0.6" opacity="0.25" />
      <path d="M 190 205 L 182 200 L 186 210 Z" fill={NEON} opacity="0.4" />
      <path d="M 695 236 L 703 231 L 699 241 Z" fill={NEON} opacity="0.35" />
      <circle cx="200" cy="208" r="2" fill={NEON} opacity="0.6" />
    </g>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

const SILHOUETTES: Record<SegmentKey, (props: { powertrain: Powertrain; bgColor: string }) => React.ReactElement> = {
  sedan: ({ powertrain, bgColor }) => (
    <g>
      <SedanBody />
      {powertrain === 'ICE' && <EngineIndicator />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BatteryIndicator />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BrakeIndicator cx={220} cy={248} bgColor={bgColor} />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BrakeIndicator cx={660} cy={248} bgColor={bgColor} />}
    </g>
  ),
  suv: ({ powertrain, bgColor }) => (
    <g>
      <SuvBody />
      {powertrain === 'ICE' && <EngineIndicator />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BatteryIndicator />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BrakeIndicator cx={220} cy={248} bgColor={bgColor} />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BrakeIndicator cx={660} cy={248} bgColor={bgColor} />}
    </g>
  ),
  hatchback: ({ powertrain, bgColor }) => (
    <g>
      <HatchbackBody />
      {powertrain === 'ICE' && <EngineIndicator />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BatteryIndicator />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BrakeIndicator cx={220} cy={248} bgColor={bgColor} />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BrakeIndicator cx={660} cy={248} bgColor={bgColor} />}
    </g>
  ),
  mpv: ({ powertrain, bgColor }) => (
    <g>
      <MvpBody />
      {powertrain === 'ICE' && <EngineIndicator />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BatteryIndicator />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BrakeIndicator cx={220} cy={248} bgColor={bgColor} />}
      {(powertrain === 'EV' || powertrain === 'HEV') && <BrakeIndicator cx={660} cy={248} bgColor={bgColor} />}
    </g>
  ),
  ev: ({ powertrain, bgColor }) => (
    <g>
      <EvBody />
      <BatteryIndicator />
      <BrakeIndicator cx={220} cy={248} bgColor={bgColor} />
      <BrakeIndicator cx={660} cy={248} bgColor={bgColor} />
    </g>
  ),
}

export default function NeonWireframeCar({ type, segment, opacity = 1, className = '', theme = 'dark' }: NeonWireframeCarProps) {
  const key = mapSegment(type, segment)
  const powertrain = getPowertrain(type)
  const sil = SILHOUETTES[key]
  const bgColor = theme === 'light' ? LIGHT_BG : DARK_BG
  const textColor = theme === 'light' ? '#334155' : NEON

  return (
    <svg
      viewBox="0 0 800 280"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: theme === 'light' ? 'none' : 'drop-shadow(0 0 6px rgba(0,255,189,0.25))', opacity }}
    >
      <rect width="800" height="280" fill={bgColor} />
      <GroundLine y={252} />
      <Wheel cx={220} cy={252} r={26} showBrake={powertrain === 'EV' || powertrain === 'HEV'} bgColor={bgColor} />
      <Wheel cx={660} cy={252} r={26} showBrake={powertrain === 'EV' || powertrain === 'HEV'} bgColor={bgColor} />
      {sil({ powertrain, bgColor })}
      <text x="400" y="14" fill={textColor} fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.5" letterSpacing="3">
        {key.toUpperCase()} {powertrain !== 'ICE' ? `· ${powertrain}` : ''}
      </text>
    </svg>
  )
}
