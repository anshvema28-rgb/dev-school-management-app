import { Alert as NativeAlert, Platform } from 'react-native'

// Web-safe Alert adapter.
// react-native-web ships Alert.alert() as a NO-OP (nothing is rendered), which
// silently broke confirmations (destructive actions never ran) and all
// success/error/validation feedback on the Vercel build.
//
// RULE:
//   web    -> confirmation uses window.confirm(), messages use window.alert()
//   native -> delegates to the real react-native Alert.alert() unchanged
//
// Call sites keep their original wording, buttons, async onPress handlers and
// error handling — only the delivery mechanism differs per platform.

type AlertButton = {
  text?: string
  style?: 'default' | 'cancel' | 'destructive' | string
  onPress?: () => void
}

const webMessage = (title: string, message?: string) =>
  message ? `${title}\n\n${message}` : title

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: any) {
    if (Platform.OS !== 'web') {
      // Native: identical behavior to react-native's Alert.alert
      NativeAlert.alert(title, message, buttons as any, options)
      return
    }

    // Web: no buttons -> simple message
    if (!buttons || buttons.length === 0) {
      window.alert(webMessage(title, message))
      return
    }

    // Single button -> message; its onPress runs after dismissal (native parity)
    if (buttons.length === 1) {
      window.alert(webMessage(title, message))
      if (buttons[0].onPress) buttons[0].onPress()
      return
    }

    // Multi button -> confirm dialog:
    //  - confirm action = 'destructive' button, else the last non-cancel button
    //  - cancel action  = 'cancel' button (runs only if provided)
    const cancelBtn = buttons.find((b) => b.style === 'cancel')
    const nonCancel = buttons.filter((b) => b.style !== 'cancel')
    const confirmBtn =
      nonCancel.find((b) => b.style === 'destructive') ||
      nonCancel[nonCancel.length - 1] ||
      buttons[0]

    if (window.confirm(webMessage(title, message))) {
      if (confirmBtn && confirmBtn.onPress) confirmBtn.onPress()
    } else if (cancelBtn && cancelBtn.onPress) {
      cancelBtn.onPress()
    }
  },
}
