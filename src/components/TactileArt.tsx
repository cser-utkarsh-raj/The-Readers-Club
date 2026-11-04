import React from 'react';
import { PresetPersonalityId } from '../types/book';

/**
 * Pop-Art Halftone Portrait SVGs for the 4 Club Personalities
 * Inspired directly by the yellow lanyard ID card portrait in the reference image.
 */
export const PersonaPortraitSvg: React.FC<{
  personaId: PresetPersonalityId;
  className?: string;
}> = ({ personaId, className = 'w-full h-full' }) => {
  switch (personaId) {
    case 'homelander':
      return (
        <svg viewBox="0 0 160 150" className={className} aria-hidden="true">
          {/* Comic Starburst & Stripes Backdrop */}
          <rect width="160" height="150" fill="#FF1493" />
          <circle cx="80" cy="75" r="64" fill="#1E3A8A" stroke="#111" strokeWidth="3" />
          <path d="M25 125 L135 125 L125 150 L35 150 Z" fill="#E11D48" stroke="#111" strokeWidth="3" />
          {/* Golden Shoulder Epaulettes */}
          <ellipse cx="42" cy="126" rx="18" ry="9" fill="#F6C90E" stroke="#111" strokeWidth="3" />
          <ellipse cx="118" cy="126" rx="18" ry="9" fill="#F6C90E" stroke="#111" strokeWidth="3" />
          {/* Pop-Art Cyan Face (matching reference image skin tone aesthetic) */}
          <path
            d="M55 52 C55 34, 105 34, 105 52 L103 95 C103 112, 80 118, 80 118 C80 118, 57 112, 57 95 Z"
            fill="#22D3EE"
            stroke="#111"
            strokeWidth="3.5"
          />
          {/* Swept-back Golden Blonde Hair */}
          <path
            d="M50 56 C46 28, 75 18, 108 28 C114 38, 110 54, 105 58 C96 42, 65 40, 55 56 Z"
            fill="#FACC15"
            stroke="#111"
            strokeWidth="3.5"
          />
          {/* Glowing Red Laser Eyes */}
          <ellipse cx="69" cy="68" rx="6" ry="3.5" fill="#FF1E1E" stroke="#111" strokeWidth="2" />
          <ellipse cx="91" cy="68" rx="6" ry="3.5" fill="#FF1E1E" stroke="#111" strokeWidth="2" />
          <circle cx="69" cy="68" r="2" fill="#FFF" />
          <circle cx="91" cy="68" r="2" fill="#FFF" />
          {/* Smirk */}
          <path d="M70 96 Q82 103 93 93" fill="none" stroke="#111" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );

    case 'taylor_swift':
      return (
        <svg viewBox="0 0 160 150" className={className} aria-hidden="true">
          {/* Hot Pink Halftone Pop-Art Portrait (closest to Leila reference card) */}
          <rect width="160" height="150" fill="#FF1493" />
          {/* Yellow Hoodie/Collar */}
          <path
            d="M28 150 C34 115, 58 108, 80 108 C102 108, 126 115, 132 150 Z"
            fill="#F6C90E"
            stroke="#111"
            strokeWidth="3.5"
          />
          {/* Pop-Art Cyan Face */}
          <path
            d="M56 50 C56 32, 104 32, 104 50 L101 94 C101 110, 80 116, 80 116 C80 116, 59 110, 59 94 Z"
            fill="#38BDF8"
            stroke="#111"
            strokeWidth="3.5"
          />
          {/* Iconic Bangs & Flowing Hair */}
          <path
            d="M44 98 C40 52, 50 22, 82 22 C112 22, 120 52, 116 98 C110 82, 108 62, 103 52 C92 56, 68 56, 57 50 C52 64, 50 82, 44 98 Z"
            fill="#FDE047"
            stroke="#111"
            strokeWidth="3.5"
          />
          {/* Pink Eyeshadow & Winged Eyeliner */}
          <path d="M62 66 Q69 61 76 66" fill="none" stroke="#FF1493" strokeWidth="4" />
          <path d="M84 66 Q91 61 98 66" fill="none" stroke="#FF1493" strokeWidth="4" />
          <circle cx="69" cy="68" r="3" fill="#111" />
          <circle cx="91" cy="68" r="3" fill="#111" />
          {/* Signature Classic Red Lip */}
          <path
            d="M72 95 Q80 91 88 95 Q80 103 72 95 Z"
            fill="#E11D48"
            stroke="#111"
            strokeWidth="2.5"
          />
        </svg>
      );

    case 'deadpool':
      return (
        <svg viewBox="0 0 160 150" className={className} aria-hidden="true">
          <rect width="160" height="150" fill="#00E5FF" />
          {/* Crossed Katanas Behind */}
          <line x1="25" y1="25" x2="135" y2="135" stroke="#111" strokeWidth="7" strokeLinecap="round" />
          <line x1="135" y1="25" x2="25" y2="135" stroke="#111" strokeWidth="7" strokeLinecap="round" />
          {/* Shoulders */}
          <path d="M25 150 C32 116, 128 116, 135 150 Z" fill="#DC2626" stroke="#111" strokeWidth="3.5" />
          {/* Crimson Mask */}
          <ellipse cx="80" cy="74" rx="30" ry="38" fill="#E11D48" stroke="#111" strokeWidth="3.5" />
          {/* Black Eye Patches */}
          <ellipse cx="67" cy="70" rx="10" ry="15" transform="rotate(-12 67 70)" fill="#111" />
          <ellipse cx="93" cy="70" rx="10" ry="15" transform="rotate(12 93 70)" fill="#111" />
          {/* Expressive White Comic Eyes (One raised eyebrow) */}
          <path d="M61 70 Q67 63 73 70 Q67 74 61 70 Z" fill="#FFF" />
          <ellipse cx="93" cy="69" rx="6" ry="6.5" fill="#FFF" />
        </svg>
      );

    case 'gandalf':
    default:
      return (
        <svg viewBox="0 0 160 150" className={className} aria-hidden="true">
          <rect width="160" height="150" fill="#F5B800" />
          {/* Grey Cloak */}
          <path d="M24 150 C32 115, 128 115, 136 150 Z" fill="#475569" stroke="#111" strokeWidth="3.5" />
          {/* Face */}
          <ellipse cx="80" cy="74" rx="24" ry="28" fill="#38BDF8" stroke="#111" strokeWidth="3" />
          {/* Flowing Silver Beard & Mustache */}
          <path
            d="M52 78 C48 115, 66 142, 80 146 C94 142, 112 115, 108 78 C96 86, 64 86, 52 78 Z"
            fill="#F8FAFC"
            stroke="#111"
            strokeWidth="3.5"
          />
          {/* Iconic Pointed Wizard Hat */}
          <path
            d="M22 52 Q80 38 138 52 L108 36 L82 6 L54 36 Z"
            fill="#334155"
            stroke="#111"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {/* Bushy Eyebrows & Wise Eyes */}
          <path d="M60 62 L75 65" stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" />
          <path d="M100 62 L85 65" stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" />
          <circle cx="69" cy="69" r="3" fill="#111" />
          <circle cx="91" cy="69" r="3" fill="#111" />
        </svg>
      );
  }
};

/**
 * Circular Pop-Art Enamel Club Badges (matching the 3 round stickers on the orange jacket)
 */
export const CircularClubBadge: React.FC<{
  topText: string;
  bottomText: string;
  bgColor: string;
  ringColor?: string;
  iconType: 'hippo_reader' | 'bee_tester' | 'bird_scribe';
  onClick?: () => void;
}> = ({ topText, bottomText, bgColor, ringColor = '#FFFFFF', iconType, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${topText} ${bottomText}`}
      className="group relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-[3px] border-[#111] shadow-brutal transition-transform duration-150 hover:-translate-y-1 active:translate-y-0 cursor-pointer select-none shrink-0"
      style={{ backgroundColor: ringColor }}
    >
      <svg viewBox="0 0 120 120" className="w-full h-full">
        <defs>
          <path id={`topArc-${iconType}`} d="M 16,60 A 44,44 0 1,1 104,60" />
          <path id={`botArc-${iconType}`} d="M 104,60 A 44,44 0 1,1 16,60" />
        </defs>
        {/* Outer Ring & Inner Colored Medallion */}
        <circle cx="60" cy="60" r="57" fill={ringColor} stroke="#111" strokeWidth="2.5" />
        <circle cx="60" cy="60" r="37" fill={bgColor} stroke="#111" strokeWidth="2.5" />

        {/* Center Pop-Art Mascot */}
        {iconType === 'hippo_reader' && (
          <g>
            {/* Hippo Reader with Crown & Book */}
            <circle cx="60" cy="54" r="14" fill="#64748B" stroke="#111" strokeWidth="2.2" />
            <ellipse cx="60" cy="61" rx="16" ry="10" fill="#94A3B8" stroke="#111" strokeWidth="2.2" />
            <polygon points="50,40 55,32 60,39 65,32 70,40" fill="#F6C90E" stroke="#111" strokeWidth="1.8" />
            <rect x="46" y="66" width="28" height="14" rx="2" fill="#E50914" stroke="#111" strokeWidth="2" />
            <line x1="60" y1="66" x2="60" y2="80" stroke="#F6C90E" strokeWidth="2" />
          </g>
        )}

        {iconType === 'bee_tester' && (
          <g>
            {/* Striped Bee holding Open Compact Book */}
            <ellipse cx="60" cy="60" rx="15" ry="18" fill="#F6C90E" stroke="#111" strokeWidth="2.2" />
            <line x1="47" y1="55" x2="73" y2="55" stroke="#111" strokeWidth="3.5" />
            <line x1="46" y1="63" x2="74" y2="63" stroke="#111" strokeWidth="3.5" />
            <ellipse cx="44" cy="50" rx="9" ry="5" fill="#E0F2FE" stroke="#111" strokeWidth="2" />
            <ellipse cx="76" cy="50" rx="9" ry="5" fill="#E0F2FE" stroke="#111" strokeWidth="2" />
            <rect x="40" y="56" width="16" height="13" fill="#0047FF" stroke="#111" strokeWidth="2" />
          </g>
        )}

        {iconType === 'bird_scribe' && (
          <g>
            {/* Blue Bird Scribe with Red Envelope/Book */}
            <circle cx="60" cy="52" r="13" fill="#0047FF" stroke="#111" strokeWidth="2.2" />
            <polygon points="60,50 74,46 62,56" fill="#F97316" stroke="#111" strokeWidth="1.8" />
            <ellipse cx="60" cy="70" rx="16" ry="13" fill="#1D4ED8" stroke="#111" strokeWidth="2.2" />
            <rect x="48" y="64" width="24" height="14" fill="#E50914" stroke="#111" strokeWidth="2" />
          </g>
        )}

        {/* Curved Perimeter Text */}
        <text
          fill="#111"
          fontSize="8"
          fontWeight="800"
          letterSpacing="1"
          textAnchor="middle"
        >
          <textPath href={`#topArc-${iconType}`} startOffset="50%">
            {topText}
          </textPath>
        </text>
        <text
          fill="#111"
          fontSize="7.8"
          fontWeight="800"
          letterSpacing="1"
          textAnchor="middle"
        >
          <textPath href={`#botArc-${iconType}`} startOffset="50%">
            {bottomText}
          </textPath>
        </text>
      </svg>
    </button>
  );
};

/**
 * Illustrated Pop-Art Pocket Mouth Strip (matching the shield/rocket/globe collage in the pocket opening)
 */
export const PocketCollageStrip: React.FC = () => {
  return (
    <div className="relative w-full h-24 overflow-hidden border-t-[3px] border-x-[3px] border-[#111] bg-[#6366F1]">
      <svg
        viewBox="0 0 600 110"
        preserveAspectRatio="none"
        className="w-full h-full"
        aria-hidden="true"
      >
        {/* Left Section: Pop-Art Globe & Coffee Cup */}
        <rect x="0" y="0" width="200" height="110" fill="#818CF8" />
        <circle cx="115" cy="48" r="36" fill="#60A5FA" stroke="#111" strokeWidth="2.5" />
        <path
          d="M95 28 Q115 38 110 60 Q90 70 85 45 Z M125 32 Q145 40 135 68 Q120 65 125 32 Z"
          fill="#F472B6"
          stroke="#111"
          strokeWidth="1.8"
        />
        <path d="M10 85 Q35 65 60 85 L55 110 L15 110 Z" fill="#22C55E" stroke="#111" strokeWidth="2.5" />
        <ellipse cx="35" cy="85" rx="25" ry="8" fill="#78350F" stroke="#111" strokeWidth="2.5" />

        {/* Center Section: "Make Reading Compact Again!" Crest Shield */}
        <polygon points="200,0 400,0 400,110 200,110" fill="#A855F7" stroke="#111" strokeWidth="2.5" />
        <path
          d="M245 10 L355 10 L355 62 C355 88, 300 104, 300 104 C300 104, 245 88, 245 62 Z"
          fill="#F59E0B"
          stroke="#111"
          strokeWidth="3"
        />
        <line x1="300" y1="30" x2="300" y2="104" stroke="#111" strokeWidth="2.5" />
        {/* Rocket on Right Half of Shield */}
        <path d="M326 42 L338 66 L314 66 Z" fill="#38BDF8" stroke="#111" strokeWidth="2" />
        <circle cx="326" cy="58" r="4" fill="#FACC15" stroke="#111" strokeWidth="1.5" />
        <text x="300" y="24" textAnchor="middle" fill="#111" fontSize="9.5" fontWeight="900">
          30-40 PAGE CLUB
        </text>

        {/* Right Section: Retro Bookshelf & Pink Reading Monitor */}
        <rect x="400" y="0" width="200" height="110" fill="#1E293B" stroke="#111" strokeWidth="2.5" />
        <rect x="430" y="34" width="115" height="62" rx="4" fill="#F472B6" stroke="#111" strokeWidth="2.5" />
        <rect x="438" y="42" width="42" height="10" rx="2" fill="#FDE047" stroke="#111" strokeWidth="1.5" />
        <rect x="438" y="56" width="60" height="10" rx="2" fill="#38BDF8" stroke="#111" strokeWidth="1.5" />
        <rect x="555" y="20" width="14" height="75" fill="#22C55E" stroke="#111" strokeWidth="2" />
        <rect x="572" y="28" width="14" height="67" fill="#E50914" stroke="#111" strokeWidth="2" />
      </svg>
    </div>
  );
};
