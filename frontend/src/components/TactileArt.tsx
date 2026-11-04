import React, { useState, useEffect, useRef } from 'react';
import { PresetPersonalityId } from '../types/book';

import homelanderImg from '../assets/images/persona_homelander_1793777131487.jpg';
import taylorSwiftImg from '../assets/images/persona_taylor_swift_1793777132534.jpg';
import deadpoolBaseImg from '../assets/images/pop_art_satirist_portrait_1793780751341.jpg';
import gandalfImg from '../assets/images/persona_gandalf_1793777136062.jpg';
import pocketCollageImg from '../assets/images/pocket_collage_banner_1793777137554.jpg';
import badgeHippoImg from '../assets/images/badge_hippo_crown_1793777137410.jpg';
import badgeBirdImg from '../assets/images/badge_bird_scribe_1793777138560.jpg';
import badgeBeeImg from '../assets/images/badge_bee_scholar_1793777139710.jpg';
import clubLogoImg from '../assets/images/readers_club_logo_1793780678518.jpg';

const PERSONA_ARTWORK_MAP: Record<PresetPersonalityId, string> = {
  homelander: homelanderImg,
  taylor_swift: taylorSwiftImg,
  deadpool: deadpoolBaseImg,
  gandalf: gandalfImg,
};

let cachedDeadpoolDataUrl: string | null = null;

/**
 * High-Resolution 1024x1024 Pop-Art Silkscreen Deadpool Portrait Renderer
 * Composites the full crimson-and-black Deadpool cowl mask, expressive white eyes,
 * dual crossed katanas, and tactical red/black suit onto the vintage halftone pop-art base.
 */
const DeadpoolPopArtPortrait: React.FC<{ className?: string }> = ({
  className = 'w-full h-full',
}) => {
  const [renderedSrc, setRenderedSrc] = useState<string | null>(
    cachedDeadpoolDataUrl
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (cachedDeadpoolDataUrl) {
      setRenderedSrc(cachedDeadpoolDataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const context = canvas.getContext('2d');
      if (!context) return;
      const ctx = context;

      function createHalftonePattern(
        bgColor: string,
        dotColor: string,
        spacing: number,
        radius: number
      ) {
        const p = document.createElement('canvas');
        p.width = spacing;
        p.height = spacing;
        const pctx = p.getContext('2d');
        if (pctx) {
          pctx.fillStyle = bgColor;
          pctx.fillRect(0, 0, spacing, spacing);
          pctx.fillStyle = dotColor;
          pctx.beginPath();
          pctx.arc(spacing / 2, spacing / 2, radius, 0, Math.PI * 2);
          pctx.fill();
        }
        return ctx.createPattern(p, 'repeat') || bgColor;
      }

      ctx.drawImage(img, 0, 0, 1024, 1024);

      const yellowCyanDots = createHalftonePattern(
        '#F8E231',
        '#00ACC1',
        14,
        4.5
      );
      const redCrimsonDots = createHalftonePattern(
        '#D90812',
        '#7A0006',
        10,
        3.3
      );
      const redHighlightDots = createHalftonePattern(
        '#FF222B',
        '#B0000A',
        10,
        2.2
      );
      const darkSuitDots = createHalftonePattern(
        '#1B1F27',
        '#08090C',
        9,
        2.8
      );

      // 1. Clean pop-art halftone background over the old hair/head area
      ctx.save();
      ctx.beginPath();
      ctx.rect(230, 62, 515, 500);
      ctx.clip();
      ctx.fillStyle = yellowCyanDots;
      ctx.fillRect(230, 62, 515, 500);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3.5;
      for (let x = 700; x <= 760; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 62);
        ctx.lineTo(x, 560);
        ctx.stroke();
      }
      for (let y = 70; y <= 550; y += 28) {
        ctx.beginPath();
        ctx.moveTo(700, y);
        ctx.lineTo(760, y);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Dual Crossed Katana Hilts behind Deadpool shoulders
      function drawKatana(cx: number, cy: number, angle: number) {
        if (!ctx) return;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = '#111';
        ctx.strokeStyle = '#080808';
        ctx.lineWidth = 8;
        ctx.fillRect(-18, 0, 36, 175);
        ctx.strokeRect(-18, 0, 36, 175);
        ctx.fillStyle = '#D4AF37';
        ctx.fillRect(-36, -14, 72, 16);
        ctx.strokeRect(-36, -14, 72, 16);
        ctx.fillStyle = '#141414';
        ctx.fillRect(-16, -168, 32, 154);
        ctx.strokeRect(-16, -168, 32, 154);
        ctx.fillStyle = '#E50914';
        for (let y = -152; y < -22; y += 26) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(13, y + 11);
          ctx.lineTo(0, y + 22);
          ctx.lineTo(-13, y + 11);
          ctx.closePath();
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.fillStyle = '#D4AF37';
        ctx.fillRect(-18, -182, 36, 14);
        ctx.lineWidth = 6;
        ctx.strokeRect(-18, -182, 36, 14);
        ctx.restore();
      }
      drawKatana(320, 460, -0.46);
      drawKatana(670, 460, 0.46);

      // 3. Deadpool Tactical Red & Black Suit Torso & Shoulders
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(95, 955);
      ctx.lineTo(125, 680);
      ctx.quadraticCurveTo(180, 555, 330, 518);
      ctx.lineTo(665, 518);
      ctx.quadraticCurveTo(815, 555, 880, 720);
      ctx.lineTo(925, 955);
      ctx.closePath();
      ctx.fillStyle = redCrimsonDots;
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#080808';
      ctx.stroke();

      // Black tactical shoulder armor & chest straps
      ctx.fillStyle = darkSuitDots;
      ctx.beginPath();
      ctx.moveTo(125, 690);
      ctx.quadraticCurveTo(185, 555, 345, 522);
      ctx.lineTo(380, 670);
      ctx.lineTo(240, 760);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(645, 522);
      ctx.quadraticCurveTo(800, 555, 875, 700);
      ctx.lineTo(760, 780);
      ctx.lineTo(610, 650);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(365, 515);
      ctx.lineTo(625, 515);
      ctx.lineTo(585, 645);
      ctx.lineTo(405, 645);
      ctx.closePath();
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.stroke();

      // Iconic Deadpool circular emblem on chest strap
      ctx.beginPath();
      ctx.arc(495, 585, 32, 0, Math.PI * 2);
      ctx.fillStyle = '#E50914';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(495, 553);
      ctx.lineTo(495, 617);
      ctx.stroke();
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(480, 585, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(510, 585, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4. Muscular Neck in Crimson Spandex with Comic Chin Shadow
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(400, 440);
      ctx.lineTo(400, 540);
      ctx.quadraticCurveTo(495, 575, 590, 540);
      ctx.lineTo(590, 440);
      ctx.closePath();
      ctx.fillStyle = redCrimsonDots;
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#080808';
      ctx.stroke();

      ctx.fillStyle = '#080808';
      ctx.beginPath();
      ctx.moveTo(405, 450);
      ctx.quadraticCurveTo(495, 535, 585, 450);
      ctx.lineTo(585, 495);
      ctx.quadraticCurveTo(495, 560, 405, 495);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 5. Iconic Full-Head Deadpool Mask (Cowl)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(495, 112);
      ctx.lineTo(508, 95);
      ctx.lineTo(516, 114);
      ctx.bezierCurveTo(615, 120, 662, 195, 655, 305);
      ctx.bezierCurveTo(650, 395, 610, 465, 550, 505);
      ctx.quadraticCurveTo(495, 534, 440, 505);
      ctx.bezierCurveTo(380, 465, 340, 395, 335, 305);
      ctx.bezierCurveTo(328, 195, 375, 120, 495, 112);
      ctx.closePath();

      ctx.fillStyle = redHighlightDots;
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = redCrimsonDots;
      ctx.beginPath();
      ctx.moveTo(495, 95);
      ctx.lineTo(680, 95);
      ctx.lineTo(680, 550);
      ctx.lineTo(495, 550);
      ctx.closePath();
      ctx.fill();

      // Center stitched seam
      ctx.strokeStyle = '#080808';
      ctx.lineWidth = 4.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(495, 112);
      ctx.lineTo(495, 520);
      ctx.stroke();
      ctx.setLineDash([]);

      // Cheek & smirk fabric folds under mask
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(495, 415, 62, 0.25, Math.PI - 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(422, 415, 18, 2.2, 4.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(568, 415, 18, -1.0, 1.0);
      ctx.stroke();

      // Nose bridge contour lines on mask
      ctx.beginPath();
      ctx.moveTo(482, 325);
      ctx.lineTo(476, 372);
      ctx.lineTo(495, 382);
      ctx.lineTo(514, 372);
      ctx.lineTo(508, 325);
      ctx.stroke();
      ctx.restore();

      ctx.lineWidth = 11;
      ctx.strokeStyle = '#080808';
      ctx.stroke();

      // 6. Iconic Large Black Eye Patches
      ctx.fillStyle = '#0B0D12';
      ctx.beginPath();
      ctx.moveTo(362, 260);
      ctx.bezierCurveTo(368, 200, 445, 210, 472, 265);
      ctx.bezierCurveTo(480, 320, 455, 368, 405, 365);
      ctx.bezierCurveTo(362, 360, 355, 310, 362, 260);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#000';
      ctx.stroke();

      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(372, 275);
      ctx.quadraticCurveTo(375, 345, 415, 353);
      ctx.stroke();

      ctx.fillStyle = '#0B0D12';
      ctx.beginPath();
      ctx.moveTo(518, 262);
      ctx.bezierCurveTo(545, 192, 625, 190, 632, 255);
      ctx.bezierCurveTo(638, 312, 622, 362, 582, 364);
      ctx.bezierCurveTo(535, 365, 512, 318, 518, 262);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#000';
      ctx.stroke();

      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(620, 270);
      ctx.quadraticCurveTo(615, 342, 575, 352);
      ctx.stroke();

      // 7. Expressive White Deadpool Eyes (One squinting, one raised!)
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(382, 282);
      ctx.lineTo(454, 294);
      ctx.quadraticCurveTo(432, 326, 392, 315);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(536, 288);
      ctx.quadraticCurveTo(576, 248, 612, 274);
      ctx.quadraticCurveTo(598, 322, 544, 312);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#080808';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(475, 240);
      ctx.lineTo(486, 275);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(514, 232);
      ctx.lineTo(504, 272);
      ctx.stroke();
      ctx.restore();

      // 8. Re-composite the Foreground Coffee Mug & Open Comic Book
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(135, 600);
      ctx.lineTo(270, 425);
      ctx.lineTo(395, 425);
      ctx.lineTo(445, 550);
      ctx.lineTo(460, 560);
      ctx.lineTo(905, 520);
      ctx.lineTo(945, 555);
      ctx.lineTo(915, 955);
      ctx.lineTo(455, 955);
      ctx.lineTo(450, 780);
      ctx.lineTo(255, 780);
      ctx.lineTo(135, 650);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 0, 0, 1024, 1024);
      ctx.restore();

      const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
      cachedDeadpoolDataUrl = dataUrl;
      setRenderedSrc(dataUrl);
    };
    img.src = deadpoolBaseImg;
  }, []);

  return (
    <div className={`${className} relative overflow-hidden bg-[#111]`}>
      {renderedSrc ? (
        <img
          src={renderedSrc}
          alt="Deadpool portrait"
          className="w-full h-full object-cover object-center"
        />
      ) : (
        <canvas
          ref={canvasRef}
          width={1024}
          height={1024}
          aria-label="Deadpool portrait"
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );
};

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
