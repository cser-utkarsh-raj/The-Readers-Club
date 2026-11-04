import React, { useState } from 'react';
import { PresetPersonalityId } from '../types/book';

import homelanderImg from '../assets/images/persona_homelander_1793777131487.jpg';
import taylorSwiftImg from '../assets/images/persona_taylor_swift_1793777132534.jpg';
import gandalfImg from '../assets/images/persona_gandalf_1793777136062.jpg';
import pocketCollageImg from '../assets/images/pocket_collage_banner_1793777137554.jpg';
import badgeHippoImg from '../assets/images/badge_hippo_crown_1793777137410.jpg';
import badgeBirdImg from '../assets/images/badge_bird_scribe_1793777138560.jpg';
import badgeBeeImg from '../assets/images/badge_bee_scholar_1793777139710.jpg';
import clubLogoImg from '../assets/images/readers_club_logo_1793780678518.jpg';

const PERSONA_ARTWORK_MAP: Partial<Record<PresetPersonalityId, string>> = {
  homelander: homelanderImg,
  taylor_swift: taylorSwiftImg,
  gandalf: gandalfImg,
};

import DeadpoolPopArtPortrait from './DeadpoolPopArtPortrait';

/**
 * Pop-Art App Logo for The Readers Club
 */
export const ReadersClubLogo: React.FC<{ className?: string }> = ({
  className = 'w-9 h-9',
}) => {
  return (
    <div
      className={`${className} border-2 border-white rounded-lg overflow-hidden bg-[#F6C90E] shrink-0 shadow-brutal-sm`}
    >
      <img
        src={clubLogoImg}
        alt="The Readers Club Logo"
        className="w-full h-full object-cover"
      />
    </div>
  );
};

/**
 * Pop-Art Halftone Portrait for all 4 Author / Narrator Personalities
 */
export const PersonaPortraitSvg: React.FC<{
  personaId: PresetPersonalityId;
  className?: string;
}> = ({ personaId, className = 'w-full h-full' }) => {
  if (personaId === 'deadpool') {
    return <DeadpoolPopArtPortrait className={className} />;
  }

  const artworkSrc = PERSONA_ARTWORK_MAP[personaId] || taylorSwiftImg;

  return (
    <div className={`${className} relative overflow-hidden bg-[#111]`}>
      <img
        src={artworkSrc}
        alt={`${personaId.replace('_', ' ')} portrait`}
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover object-center"
      />
    </div>
  );
};

/**
 * Tactile Pop-Art Circular Enamel Pin Badge with AI-Generated Mascot Artwork
 */
export const CircularClubBadge: React.FC<{
  topText: string;
  bottomText: string;
  bgColor: string;
  iconType: 'hippo_reader' | 'bird_scribe' | 'bee_tester';
  onClick?: () => void;
  className?: string;
}> = ({
  topText,
  bottomText,
  bgColor,
  iconType,
  onClick,
  className = '',
}) => {
  const badgeArtMap = {
    hippo_reader: badgeHippoImg,
    bird_scribe: badgeBirdImg,
    bee_tester: badgeBeeImg,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${topText} — ${bottomText}`}
      className={`group relative w-32 h-32 sm:w-36 sm:h-36 rounded-full border-[3px] border-[#111] shadow-brutal bg-white p-1.5 transition-transform duration-200 hover:-translate-y-1 hover:rotate-3 cursor-pointer focus:outline-none ${className}`}
    >
      {/* Circular AI Mascot Center */}
      <div
        className="w-full h-full rounded-full border-2 border-[#111] overflow-hidden relative flex items-center justify-center"
        style={{ backgroundColor: bgColor }}
      >
        <img
          src={badgeArtMap[iconType]}
          alt=""
          className="w-20 h-20 sm:w-22 sm:h-22 rounded-full object-cover border-2 border-[#111]"
        />
      </div>

      {/* Curved Rim Typography Overlay */}
      <svg
        viewBox="0 0 120 120"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <path
            id={`topArc-${iconType}`}
            d="M 15,60 A 45,45 0 1,1 105,60"
          />
          <path
            id={`botArc-${iconType}`}
            d="M 105,60 A 45,45 0 1,1 15,60"
          />
        </defs>
        <circle
          cx="60"
          cy="60"
          r="50"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="14"
        />
        <circle
          cx="60"
          cy="60"
          r="43"
          fill="none"
          stroke="#111111"
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
 * Illustrated Pop-Art Pocket Mouth Banner
 */
export const PocketCollageStrip: React.FC = () => {
  return (
    <div className="relative w-full h-24 sm:h-28 overflow-hidden border-t-[3px] border-x-[3px] border-[#111] bg-[#1E293B]">
      <img
        src={pocketCollageImg}
        alt="The Readers Club Studio"
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
      <div className="absolute bottom-2 right-3 bg-[#F6C90E] text-[#111] border-2 border-[#111] px-2.5 py-0.5 font-mono-tech text-[10px] font-bold uppercase shadow-brutal-sm">
        THE READERS CLUB
      </div>
    </div>
  );
};

/**
 * Full-Frame Uncropped Book Poster Cover Component
 * Uses a soft ambient backdrop + crisp object-contain foreground so book titles
 * and cover artwork are never cut off at the top, bottom, or sides.
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
        className={`${className} relative bg-[#18181B] overflow-hidden shrink-0 flex items-center justify-center`}
      >
        {/* Soft blurred ambient fill so there are never empty bars */}
        <img
          src={coverUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover blur-md opacity-45 scale-110 pointer-events-none select-none"
        />
        {/* Crisp, uncropped full book cover */}
        <img
          src={coverUrl}
          alt={`${title} book cover`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="relative z-10 w-full h-full object-contain p-1 drop-shadow-[0_4px_8px_rgba(0,0,0,0.65)]"
        />
      </div>
    );
  }

  return (
    <div
      className={`${className} relative p-2.5 flex flex-col justify-between shrink-0 overflow-hidden`}
      style={{ backgroundColor: coverColor }}
    >
      <div className="w-1.5 h-full bg-black/30 absolute left-0 top-0" />
      <div className="pl-1.5 border-b border-white/30 pb-1">
        <div className="text-[9px] font-mono-tech uppercase text-white/85 truncate">
          {author}
        </div>
      </div>
      <div className="pl-1.5 my-auto">
        <div className="font-display-brutal text-xs leading-tight text-white uppercase line-clamp-3">
          {title}
        </div>
      </div>
      <div className="pl-1.5 pt-1 border-t border-white/30 text-[8px] font-mono-tech text-[#F6C90E] uppercase">
        HARDCOVER
      </div>
    </div>
  );
};
