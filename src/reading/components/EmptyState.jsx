import React from 'react';

// 空狀態：圖示、標題、說明，必要時附一個行動按鈕
export default function EmptyState({ icon: Icon, title, desc, action, onAction }) {
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-icon">
          <Icon size={30} strokeWidth={1.6} />
        </span>
      )}
      <strong>{title}</strong>
      {desc && <p>{desc}</p>}
      {action && (
        <button className="primary" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
