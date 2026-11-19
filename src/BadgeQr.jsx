import React, {useMemo} from 'react';
import qrcode from 'qrcode-generator';

export const sampleBadgeId = '00000000-0000-4000-8000-000000000000';

export default function BadgeQr({badgeId}) {
  const {size, path} = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(`urn:uuid:${badgeId}`);
    code.make();
    const count = code.getModuleCount();
    const modules = [];
    for (let row = 0; row < count; row++) {
      for (let column = 0; column < count; column++) {
        if (code.isDark(row, column)) modules.push(`M${column + 4} ${row + 4}h1v1h-1z`);
      }
    }
    return {size: count + 8, path: modules.join('')};
  }, [badgeId]);

  return <svg className="badge-qr" role="img" aria-label="QR Code da emissão" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
    <rect width={size} height={size} fill="#fff"/>
    <path d={path} fill="#000"/>
  </svg>;
}
