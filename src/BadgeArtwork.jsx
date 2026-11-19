import React from 'react';
import logo from '../Gemini_Generated_Image_wvkarowvkarowvka-removebg-preview.png';

export function BadgeArtwork({reverse=false, eventName, edition, logoSrc=logo}) {
  if (!reverse) return <div className="badge-stock-front" aria-hidden="true"><i/><i/><i/></div>;

  return <article className="event-badge art-badge badge-reverse" aria-label="Verso do crachá">
    <div className="badge-reverse-content">
      <div className="badge-reverse-logo"><img src={logoSrc} alt="SIEP"/></div>
      <strong>{eventName}</strong>
      {edition && <span>{edition}</span>}
    </div>
  </article>;
}

export const badgeArtworkCss = `
.badge-stock-front{position:absolute;inset:0;overflow:hidden;background:linear-gradient(166deg,#fff 0 25%,transparent 25.2%),radial-gradient(ellipse at 0% 95%,#229557 0%,#13623f 40%,#073c31 82%)}
.badge-stock-front i{position:absolute;top:0;left:-9%;width:47%;height:8%;border-radius:0 0 100% 0;background:#0b6b91;transform:rotate(-15deg)}
.badge-stock-front i:nth-child(2){top:5%;left:-14%;width:45%;background:#ffc842;transform:rotate(-11deg)}
.badge-stock-front i:nth-child(3){top:12%;left:-19%;width:46%;background:#118759;transform:rotate(-15deg)}
.badge-stock-front::after{content:"";position:absolute;inset:91% 0 0;background:repeating-linear-gradient(138deg,#ffffff0d 0 4%,transparent 4% 8%)}
.badge-credential .badge-art-field[data-field="photo"]{background:#e3ebea;border-radius:50%;border:2px solid white}
.badge-credential .badge-art-field[data-field="person_name"],.badge-credential .badge-art-field[data-field="school_name"],.badge-credential .badge-art-field[data-field="modalities"],.badge-credential .badge-art-field[data-field="functions"],.badge-credential .badge-art-field[data-field="categories"],.badge-credential .badge-art-field[data-field="cref"],.badge-credential .badge-art-field[data-field="code"]{background:#fff;font-weight:700}
.badge-credential .badge-art-field[data-field="event_name"]{font-weight:800;text-transform:uppercase}
.badge-credential .badge-art-field[data-field="role_label"]{background:#ffc842;font-weight:800;text-transform:uppercase}
.event-badge.badge-reverse{background:radial-gradient(ellipse at 0 103%,#d9eee7 0 28%,transparent 28.2%),linear-gradient(150deg,white 0 69%,#edf4f8 69.2% 77%,white 77.2% 83%,#d9eee7 83.2%);display:grid;place-items:center;container-type:inline-size;color:#163453;text-align:center}
.badge-reverse-content{display:grid;gap:2cqw;justify-items:center;width:90%;overflow-wrap:anywhere}
.badge-reverse-content strong{font:800 7cqw/1.13 Arial,sans-serif;text-transform:uppercase}
.badge-reverse-content span{font:700 5cqw Arial,sans-serif;color:#0b6b91}
.badge-reverse-logo{width:55cqw;height:24cqw;overflow:hidden;position:relative}
.badge-reverse-logo img{width:100%;position:absolute;left:0;top:50%;transform:translateY(-50%)}
`;
