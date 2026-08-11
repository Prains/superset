import ExpoModulesCore
import UIKit

struct QuickKey: Record {
  @Field var id: String = ""
  @Field var label: String?
  @Field var symbol: String?
}

/**
 * Full-screen overlay whose content bar tracks the keyboard through
 * `keyboardLayoutGuide` — UIKit drives the animation (including interactive
 * dismiss), so the bar rides the keyboard's real curve instead of RN's timing
 * approximation. React Native mounts this absolutely over the screen; every
 * touch outside the bar falls through via `hitTest`.
 */
final class ComposerView: ExpoView, UITextViewDelegate {
  let onSubmitText = EventDispatcher()
  let onChangeText = EventDispatcher()
  let onFocusChange = EventDispatcher()
  let onQuickKey = EventDispatcher()
  let onBarMetrics = EventDispatcher()

  private let bar = UIStackView()
  private let barBackground = UIVisualEffectView()
  private let textView = UITextView()
  private let placeholderLabel = UILabel()
  private let sendButton = UIButton(type: .system)
  private let quickKeysScroll = UIScrollView()
  private let quickKeysStack = UIStackView()
  private var textHeightConstraint: NSLayoutConstraint!
  private var lastReportedBarHeight: CGFloat = -1

  private static let maxTextHeight: CGFloat = 120
  private static let minTextHeight: CGFloat = 38

  var placeholder: String = "" {
    didSet { placeholderLabel.text = placeholder }
  }

  var autoFocus: Bool = false

  var quickKeys: [QuickKey] = [] {
    didSet { rebuildQuickKeys() }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    setUp()
  }

  // MARK: - Setup

  private func setUp() {
    backgroundColor = .clear

    // Glass on iOS 26; dark blur material before that — never an unstyled void.
    if #available(iOS 26.0, *) {
      barBackground.effect = UIGlassEffect()
    } else {
      barBackground.effect = UIBlurEffect(style: .systemThickMaterialDark)
    }
    barBackground.layer.cornerRadius = 24
    barBackground.layer.cornerCurve = .continuous
    barBackground.clipsToBounds = true
    barBackground.translatesAutoresizingMaskIntoConstraints = false

    bar.axis = .vertical
    bar.spacing = 0
    bar.translatesAutoresizingMaskIntoConstraints = false

    textView.backgroundColor = .clear
    textView.font = .systemFont(ofSize: 17)
    textView.textColor = .white
    textView.tintColor = .white
    textView.keyboardAppearance = .dark
    textView.textContainerInset = UIEdgeInsets(top: 9, left: 12, bottom: 9, right: 40)
    textView.delegate = self
    textView.isScrollEnabled = false
    textView.translatesAutoresizingMaskIntoConstraints = false

    placeholderLabel.font = .systemFont(ofSize: 17)
    placeholderLabel.textColor = UIColor.white.withAlphaComponent(0.35)
    placeholderLabel.translatesAutoresizingMaskIntoConstraints = false

    var sendConfig = UIButton.Configuration.filled()
    sendConfig.image = UIImage(
      systemName: "arrow.up",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .bold)
    )
    sendConfig.cornerStyle = .capsule
    sendConfig.baseBackgroundColor = .white
    sendConfig.baseForegroundColor = .black
    sendConfig.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 6, bottom: 6, trailing: 6)
    sendButton.configuration = sendConfig
    sendButton.isHidden = true
    sendButton.addTarget(self, action: #selector(submit), for: .touchUpInside)
    sendButton.translatesAutoresizingMaskIntoConstraints = false

    quickKeysScroll.showsHorizontalScrollIndicator = false
    quickKeysScroll.translatesAutoresizingMaskIntoConstraints = false
    quickKeysStack.axis = .horizontal
    quickKeysStack.spacing = 8
    quickKeysStack.translatesAutoresizingMaskIntoConstraints = false
    quickKeysScroll.addSubview(quickKeysStack)

    let textRow = UIView()
    textRow.translatesAutoresizingMaskIntoConstraints = false
    textRow.addSubview(textView)
    textRow.addSubview(placeholderLabel)
    textRow.addSubview(sendButton)

    bar.addArrangedSubview(textRow)
    bar.addArrangedSubview(quickKeysScroll)

    addSubview(barBackground)
    barBackground.contentView.addSubview(bar)

    textHeightConstraint = textView.heightAnchor.constraint(
      equalToConstant: Self.minTextHeight)

    NSLayoutConstraint.activate([
      barBackground.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
      barBackground.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
      // The whole point of the module: UIKit pins the bar to the keyboard's
      // top edge and animates it on the keyboard's own curve.
      barBackground.bottomAnchor.constraint(
        equalTo: keyboardLayoutGuide.topAnchor, constant: -8),

      bar.topAnchor.constraint(equalTo: barBackground.contentView.topAnchor),
      bar.leadingAnchor.constraint(equalTo: barBackground.contentView.leadingAnchor),
      bar.trailingAnchor.constraint(equalTo: barBackground.contentView.trailingAnchor),
      bar.bottomAnchor.constraint(equalTo: barBackground.contentView.bottomAnchor),

      textView.topAnchor.constraint(equalTo: textRow.topAnchor, constant: 2),
      textView.leadingAnchor.constraint(equalTo: textRow.leadingAnchor, constant: 4),
      textView.trailingAnchor.constraint(equalTo: textRow.trailingAnchor, constant: -4),
      textView.bottomAnchor.constraint(equalTo: textRow.bottomAnchor, constant: -2),
      textHeightConstraint,

      placeholderLabel.leadingAnchor.constraint(
        equalTo: textView.leadingAnchor, constant: 17),
      placeholderLabel.centerYAnchor.constraint(equalTo: textView.centerYAnchor),

      sendButton.trailingAnchor.constraint(equalTo: textRow.trailingAnchor, constant: -10),
      sendButton.bottomAnchor.constraint(equalTo: textRow.bottomAnchor, constant: -8),

      quickKeysScroll.heightAnchor.constraint(equalToConstant: 44),
      quickKeysStack.topAnchor.constraint(equalTo: quickKeysScroll.contentLayoutGuide.topAnchor, constant: 6),
      quickKeysStack.leadingAnchor.constraint(equalTo: quickKeysScroll.contentLayoutGuide.leadingAnchor, constant: 12),
      quickKeysStack.trailingAnchor.constraint(equalTo: quickKeysScroll.contentLayoutGuide.trailingAnchor, constant: -12),
      quickKeysStack.bottomAnchor.constraint(equalTo: quickKeysScroll.contentLayoutGuide.bottomAnchor, constant: -6),
      quickKeysStack.heightAnchor.constraint(equalTo: quickKeysScroll.frameLayoutGuide.heightAnchor, constant: -12),
    ])
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil && autoFocus {
      textView.becomeFirstResponder()
    }
  }

  // MARK: - Pass-through

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let view = super.hitTest(point, with: event)
    // Only the bar is interactive; everything else falls through to RN.
    return view === self ? nil : view
  }

  // MARK: - Quick keys

  private func rebuildQuickKeys() {
    for view in quickKeysStack.arrangedSubviews {
      view.removeFromSuperview()
    }
    quickKeysScroll.isHidden = quickKeys.isEmpty
    for key in quickKeys {
      var config = UIButton.Configuration.gray()
      config.cornerStyle = .medium
      config.baseBackgroundColor = UIColor.white.withAlphaComponent(0.12)
      config.baseForegroundColor = .white
      config.contentInsets = NSDirectionalEdgeInsets(
        top: 4, leading: 12, bottom: 4, trailing: 12)
      if let symbol = key.symbol {
        config.image = UIImage(
          systemName: symbol,
          withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .medium))
      } else {
        config.attributedTitle = AttributedString(
          key.label ?? key.id,
          attributes: AttributeContainer([
            .font: UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)
          ]))
      }
      let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
        self?.onQuickKey(["id": key.id])
      })
      quickKeysStack.addArrangedSubview(button)
    }
  }

  // MARK: - Text handling

  @objc private func submit() {
    let text = textView.text ?? ""
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    onSubmitText(["text": text])
    clearText()
  }

  func focusInput() {
    textView.becomeFirstResponder()
  }

  func blurInput() {
    textView.resignFirstResponder()
  }

  func clearText() {
    textView.text = ""
    textViewDidChange(textView)
  }

  func textViewDidChange(_ textView: UITextView) {
    let hasText = !(textView.text ?? "").isEmpty
    placeholderLabel.isHidden = hasText
    sendButton.isHidden = !hasText

    let fitting = textView.sizeThatFits(
      CGSize(width: textView.bounds.width, height: .greatestFiniteMagnitude))
    let clamped = min(max(fitting.height, Self.minTextHeight), Self.maxTextHeight)
    textView.isScrollEnabled = fitting.height > Self.maxTextHeight
    if textHeightConstraint.constant != clamped {
      textHeightConstraint.constant = clamped
    }
    onChangeText(["text": textView.text ?? ""])
  }

  func textViewDidBeginEditing(_ textView: UITextView) {
    onFocusChange(["focused": true])
  }

  func textViewDidEndEditing(_ textView: UITextView) {
    onFocusChange(["focused": false])
  }

  // MARK: - Metrics for RN content insets

  override func layoutSubviews() {
    super.layoutSubviews()
    // Height from the screen bottom to the bar's top edge — RN pads scroll
    // content with this so nothing hides behind the bar or keyboard.
    let occluded = bounds.height - barBackground.frame.minY
    if abs(occluded - lastReportedBarHeight) > 0.5 {
      lastReportedBarHeight = occluded
      onBarMetrics(["occludedHeight": occluded])
    }
  }
}
