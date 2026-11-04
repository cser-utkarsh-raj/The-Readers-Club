import React, { useState } from 'react';
import { PresetPersonalityId } from '../types/book';

import homelanderImg from '../assets/images/persona_homelander_1793777131487.jpg';
import taylorSwiftImg from '../assets/images/persona_taylor_swift_1793777132534.jpg';
import gandalfImg from '../assets/images/persona_gandalf_1793777136062.jpg';
import pocketCollageImg from '../assets/images/pocket_collage_banner_1793777137554.jpg';
import badgeHippoImg from '../assets/images/badge_hippo_crown_1793777137410.jpg';
import badgeBirdImg from '../assets/images/badge_bird_scribe_1793777138560.jpg';
import badgeBeeImg from '../assets/images/badge_bee_scholar_1793777139710.jpg';

const PERSONA_IMAGE_MAP: Partial<Record<PresetPersonalityId, string>> = {
  homelander: homelanderImg,
  taylor_swift: taylorSwiftImg,
  gandalf: gandalfImg,
};

/**
 * AI-Generated Pop-Art Halftone Portrait for each Author & Narrator Persona,
 * with a rich Roy Lichtenstein halftone screenprint SVG for Deadpool and resilient fallback.
 */
export const PersonaPortraitSvg: React.FC<{
  personaId: PresetPersonalityId;
  className?: string;
}> = ({ personaId, className = 'w-full h-full' }) => {
  const [imgError, setImgError] = useState(false);
  const src = PERSONA_IMAGE_MAP[personaId];

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={`${personaId.replace('_', ' ')} portrait`}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${className} object-cover`}
      />
    );
  }

  // High-Craft Pop-Art Screenprint Portrait for Deadpool (matching the AI halftone series)
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden="true">
      <defs>
        <pattern
          id="deadpool-halftone"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="4" cy="4" r="2.2" fill="#0097A7" />
        </pattern>
        <pattern
          id="crimson-halftone"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="3" cy="3" r="1.5" fill="#991B1B" />
        </pattern>
      </defs>

      {/* Cyan Ben-Day Halftone Background */}
      <rect width="240" height="240" fill="#00E5FF" />
      <rect width="240" height="240" fill="url(#deadpool-halftone)" />

      {/* Pop-Art Comic Action Burst Lines */}
      <polygon points="0,0 55,0 90,75 0,40" fill="#F6C90E" stroke="#111" strokeWidth="4" />
      <polygon points="240,0 185,0 155,70 240,45" fill="#F6C90E" stroke="#111" strokeWidth="4" />

      {/* Crossed Katanas with Detailed Hilts */}
      <g stroke="#111" strokeWidth="5" strokeLinecap="round">
        <line x1="28" y1="32" x2="212" y2="215" strokeWidth="12" />
        <line x1="28" y1="32" x2="68" y2="72" stroke="#F6C90E" strokeWidth="7" />
        <line x1="212" y1="32" x2="28" y2="215" strokeWidth="12" />
        <line x1="212" y1="32" x2="172" y2="72" stroke="#F6C90E" strokeWidth="7" />
      </g>

      {/* Tactical Crimson & Black Shoulders */}
      <path
        d="M18 240 C26 176, 68 164, 120 164 C172 164, 214 176, 222 240 Z"
        fill="#E11D48"
        stroke="#111"
        strokeWidth="5"
      />
      <path
        d="M18 240 C26 176, 68 164, 120 164 C172 164, 214 176, 222 240 Z"
        fill="url(#crimson-halftone)"
      />
      <path
        d="M52 240 L74 174 L102 240 Z M188 240 L166 174 L138 240 Z"
        fill="#111"
      />

      {/* Sculpted Comic Mask Head */}
      <path
        d="M72 78 C72 34, 168 34, 168 78 C170 128, 148 168, 120 172 C92 168, 70 128, 72 78 Z"
        fill="#E11D48"
        stroke="#111"
        strokeWidth="5"
      />
      <path
        d="M72 78 C72 34, 168 34, 168 78 C170 128, 148 168, 120 172 C92 168, 70 128, 72 78 Z"
        fill="url(#crimson-halftone)"
      />

      {/* Mask Center Seam & Cel-Shaded Brow Contours */}
      <line x1="120" y1="42" x2="120" y2="170" stroke="#111" strokeWidth="3.5" />

      {/* Left & Right Black Mask Eye Patches */}
      <path
        d="M78 86 C76 64, 108 66, 112 92 C114 116, 84 124, 78 98 Z"
        fill="#111"
      />
      <path
        d="M162 86 C164 64, 132 66, 128 92 C126 116, 156 124, 162 98 Z"
        fill="#111"
      />

      {/* Expressive Raised-Eyebrow White Comic Eyes */}
      <path
        d="M84 94 Q96 82 106 94 Q96 102 84 94 Z"
        fill="#FFFFFF"
        stroke="#111"
        strokeWidth="2"
      />
      <ellipse
        cx="144"
        cy="91"
        rx="11"
        ry="12"
        fill="#FFFFFF"
        stroke="#111"
        strokeWidth="2"
      />

      {/* Open Red Hardcover Book Held in Foreground */}
      <path
        d="M70 192 L120 202 L170 192 L170 236 L120 244 L70 236 Z"
        fill="#F6C90E"
        stroke="#111"
        strokeWidth="4.5"
      />
      <line x1="120" y1="202" x2="120" y2="244" stroke="#111" strokeWidth="4" />
    </svg>
  );
};

/**
 * Circular Pop-Art Enamel Club Badges with AI-generated mascot medallions
 */
export const CircularClubBadge: React.FC<{
  topText: string;
  bottomText: string;
  bgColor: string;
  ringColor?: string;
  iconType: 'hippo_reader' | 'bee_tester' | 'bird_scribe';
  onClick?: () => void;
}> = ({
  topText,
  bottomText,
  bgColor,
  ringColor = '#FFFFFF',
  iconType,
  onClick,
}) => {
  const badgeImg =
    iconType === 'hippo_reader'
      ? badgeHippoImg
      : iconType === 'bird_scribe'
      ? badgeBirdImg
      : badgeBeeImg;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${topText} ${bottomText}`}
      className="group relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-[3px] border-[#111] shadow-brutal transition-transform duration-150 hover:-translate-y-1 active:translate-y-0 cursor-pointer select-none shrink-0 overflow-hidden"
      style={{ backgroundColor: ringColor }}
    >
      {/* Center AI Enamel Pin Artwork */}
      <div className="absolute inset-[17%] rounded-full overflow-hidden border-[2.5px] border-[#111] z-10">
        <img
          src={badgeImg}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover scale-125 group-hover:scale-135 transition-transform duration-200"
        />
      </div>

      {/* Outer Ring & Curved Typography SVG */}
      <svg viewBox="0 0 120 120" className="w-full h-full relative z-20 pointer-events-none">
        <defs>
          <path id={`topArc-${iconType}`} d="M 15,60 A 45,45 0 1,1 105,60" />
          <path id={`botArc-${iconType}`} d="M 105,60 A 45,45 0 1,1 15,60" />
        </defs>
        <circle
          cx="60"
          cy="60"
          r="57"
          fill="none"
          stroke="#111"
          strokeWidth="2.5"
        />
        <circle
          cx="60"
          cy="60"
          r="39"
          fill="none"
          stroke={bgColor}
          strokeWidth="2"
        />

        <text
          fill="#111"
          fontSize="7.8"
          fontWeight="900"
          letterSpacing="1"
          textAnchor="middle"
        >
          <textPath href={`#topArc-${iconType}`} startOffset="50%">
            {topText}
          </textPath>
        </text>
        <text
          fill="#111"
          fontSize="7.6"
          fontWeight="900"
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
 * Illustrated Pop-Art Pocket Mouth Banner using the generated neo-brutalist studio collage
 */
export const PocketCollageStrip: React.FC = () => {
  return (
    <div className="relative w-full h-24 sm:h-28 overflow-hidden border-t-[3px] border-x-[3px] border-[#111] bg-[#1E293B]">
      <img
        src={pocketCollageImg}
        alt="The Readers Club Studio Desk"
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
      <div className="absolute bottom-2 right-3 bg-[#F6C90E] text-[#111] border-2 border-[#111] px-2.5 py-0.5 font-mono-tech text-[10px] font-bold uppercase shadow-brutal-sm">
        ARCHIVE & VOICE STUDIO
      </div>
    </div>
  );
};

/**
 * Original Book Poster Cover Component with Clothbound Hardcover Fallback
 */
export const BookPosterCover: React.FC<{
  title: string;
  author: string;
  coverUrl?: string;
  coverColor?: string;
  coverAccent?: string;
  className?: string;
}> = ({
  title,
  author,
  coverUrl,
  coverColor = '#E50914',
  className = 'w-full h-full',
}) => {
  const [failed, setFailed] = useState(false);

  if (coverUrl && !failed) {
    return (
      <div
        className={`${className} relative bg-[#111] overflow-hidden shrink-0`}
      >
        <img
          src={coverUrl}
          alt={`${title} book cover`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${className} relative border-2 border-[#111] p-1.5 flex flex-col justify-between shrink-0 shadow-brutal-sm overflow-hidden`}
      style={{ backgroundColor: coverColor, color: '#FFFFFF' }}
    >
      <div className="w-1 h-full bg-black/25 absolute left-0 top-0" />
      <div className="font-mono-tech text-[7px] uppercase tracking-wider opacity-85 truncate pl-1">
        {author}
      </div>
      <div className="font-display-brutal text-[9px] leading-tight uppercase line-clamp-3 pl-1">
        {title}
      </div>
      <div className="h-1 w-full bg-[#F6C90E] border-t border-[#111]" />
    </div>
  );
};
