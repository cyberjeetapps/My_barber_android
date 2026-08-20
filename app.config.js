const withAutoVerify = require('./withAutoVerify');
const { withAndroidManifest } = require('@expo/config-plugins');

//npx expo export --platform web

module.exports = {
  expo: {
    name: "Mybarber",
    slug: "groomy",
    description: "MyBarber — Connecting every Salon in India. Book haircuts and salon appointments near you.",
    scheme: "mybarberapp",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/appicon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.groomzy.mybarberapp",
      buildNumber: "21",
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "This app needs your location to show nearby services",
        NSCameraUsageDescription: "MyBarber needs camera access so you can try on hairstyles and upload photos.",
        NSPhotoLibraryUsageDescription: "MyBarber needs photo library access so you can pick a photo to try on hairstyles."
      }
    },
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    
    },
    "web": {
      "bundler": "metro",
      "output": "single",
      "favicon": "./assets/images/homelogo1.png",
      "build": {
        "babel": {
          "include": ["withAutoVerify"]
        }
      }
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-build-properties",
        {
          android: {
            ndkVersion: "27.1.12297006",
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            useLegacyPackaging: false
          }
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/appicon.png",
          color: "#ffffff"
        }
      ],
      // ✅ Add autoVerify plugin here
      withAutoVerify
    ],
    experiments: {
      typedRoutes: true
    },
    android: {
      versionCode: 21,
      googleServicesFile: "./google-services.json",
      package: "com.groomzy.mybarberapp",
      permissions: [
        "android.permission.INTERNET",
        "android.permission.CAMERA",
        "com.google.android.gms.permission.AD_ID"
      ],
      intentFilters: [
        {
          action: "VIEW",
          data: [
            {
              scheme: "mybarberapp",
              host: "admin"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        },
        {
          action: "VIEW",
          data: [
            {
              scheme: "mybarberapp",
              host: "owner"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        },
        {
          action: "VIEW",
          data: [
            {
              scheme: "https",
              host: "mybarber.co.in",
              pathPrefix: "/admin"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        },
        {
          action: "VIEW",
          data: [
            {
              scheme: "https",
              host: "mybarber.co.in",
              pathPrefix: "/owner"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    extra: {
      router: {
        origin: false
      },
      eas: {
        projectId: "dc3f6516-1f4d-4314-a201-674acfa67484"
      }
    },
    owner: "groomzytechnologies"
  }
};
