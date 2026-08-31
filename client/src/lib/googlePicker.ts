// Thin wrapper around Google's Picker JS API (https://developers.google.com/drive/picker/guides/overview).
// Lets the user pick a single Google Sheets spreadsheet through Google's own UI, so Zinto only
// ever needs drive.file access to the file they explicitly chose — never a broad Drive scope.

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let gapiScriptPromise: Promise<void> | null = null;

function loadGapiScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Picker is only available in the browser'));
  }
  if (window.gapi) {
    return Promise.resolve();
  }
  if (!gapiScriptPromise) {
    gapiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load the Google API script'));
      document.head.appendChild(script);
    });
  }
  return gapiScriptPromise;
}

let pickerModulePromise: Promise<void> | null = null;

async function loadPickerModule(): Promise<void> {
  await loadGapiScript();
  if (window.google?.picker) {
    return;
  }
  if (!pickerModulePromise) {
    pickerModulePromise = new Promise((resolve, reject) => {
      window.gapi.load('picker', {
        callback: () => resolve(),
        onerror: () => reject(new Error('Failed to load the Google Picker module')),
      });
    });
  }
  return pickerModulePromise;
}

export interface PickedSpreadsheet {
  id: string;
  name: string;
}

/**
 * Opens Google's Picker restricted to Spreadsheets and resolves with the chosen file,
 * or null if the user cancels.
 */
export async function pickGoogleSpreadsheet(options: {
  accessToken: string;
  apiKey: string;
}): Promise<PickedSpreadsheet | null> {
  await loadPickerModule();
  const google = window.google;

  return new Promise((resolve, reject) => {
    try {
      const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
        .setMode(google.picker.DocsViewMode.LIST);

      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(options.accessToken)
        .setDeveloperKey(options.apiKey)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs?.[0];
            if (doc?.id) {
              resolve({ id: doc.id, name: doc.name || doc.id });
              return;
            }
          }
          if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Failed to open the Google Picker'));
    }
  });
}
