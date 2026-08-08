export default function LocalSecureContextNotice() {
  if (window.isSecureContext) return null

  return (
    <aside
      role="alert"
      style={{
        width: 'min(1180px, calc(100% - 32px))',
        boxSizing: 'border-box',
        margin: '12px auto',
        padding: '12px 14px',
        border: '1px solid rgba(255, 184, 82, .38)',
        borderRadius: '14px',
        color: '#ffd99b',
        background: 'rgba(93, 55, 13, .3)',
        fontSize: '.75rem',
        lineHeight: 1.6,
      }}
    >
      <strong>아이폰 로컬 HTTP 제한</strong><br />
      이 주소에서는 X32 상태를 볼 수 있지만 Safari의 보안 규칙으로 카메라·마이크 측정이 차단될 수 있습니다.
      내일 X32 직접 연결은 Mac의 localhost에서 시험하고, 아이폰 회중석 측정은 기존 HTTPS 웹앱에서 별도로 진행하세요.
    </aside>
  )
}
