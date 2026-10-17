import React, { useEffect, useState } from 'react';
import { logbookApi } from '../../services/api';

/**
 * The strip of paper a sector was read from, shown beside the fields the server
 * flagged. A pilot checking an amber time should be able to read the answer off
 * the photo without hunting for the row on a whole page.
 */
export default function RowCrop({ scanId, index, label = 'The row this was read from' }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl = null;
    logbookApi.scanRowImage(scanId, index)
      .then(({ data }) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [scanId, index]);

  if (failed) return null;
  return (
    <div className="lb-crop">
      <div className="lb-crop-label">{label}</div>
      {url
        ? <img src={url} alt="The row of the voyage report this sector was read from" />
        : <div className="lb-crop-wait">Loading the photo…</div>}
    </div>
  );
}
