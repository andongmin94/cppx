import { defineConfig } from "vitepress";

const siteTitle = "cppx";
const siteDescription = "Windows, macOS, Linux에서 쓰는 Cargo 스타일 C++ 워크플로 도구";
const siteUrl = "https://cppx.andongmin.com";
const siteImage = `${siteUrl}/logo.png`;

export default defineConfig({
  title: siteTitle,
  description: "Windows, macOS, Linux에서 쓰는 Cargo 스타일 C++ 워크플로 도구",

  head: [
    ["link", { rel: "icon", type: "image/png", href: "/logo.png" }],
    ["link", { rel: "organization", href: "https://github.com/andongmin94" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: siteTitle }],
    ["meta", { property: "og:image", content: siteImage }],
    ["meta", { property: "og:url", content: siteUrl }],
    ["meta", { property: "og:description", content: siteDescription }],
    ["meta", { name: "theme-color", content: "#237AF5" }]
  ],

  themeConfig: {
    logo: "/logo.svg",

    editLink: {
      pattern:
        "https://mail.google.com/mail/?view=cm&fs=1&to=andongmin94@gmail.com&su=cppx%20문의&body=",
      text: "Gmail로 문의하기"
    },

    socialLinks: [{ icon: "github", link: "https://github.com/andongmin94/cppx" }],

    sidebarMenuLabel: "메뉴",
    returnToTopLabel: "위로 가기",
    darkModeSwitchLabel: "다크 모드",

    docFooter: {
      prev: "이전 페이지",
      next: "다음 페이지"
    },

    footer: {
      message: "MIT 라이선스로 배포됩니다",
      copyright: "Copyright © 2026 안동민"
    },

    nav: [
      { text: "가이드", link: "/guide/", activeMatch: "/guide/" },
      { text: "마이그레이션", link: "/guide/migration" },
      { text: "유지보수", link: "/maintainer" }
    ],

    sidebar: {
      "/guide/": [
        {
          text: "cppx 가이드",
          items: [
            {
              text: "시작하기",
              link: "/guide/"
            },
            {
              text: "도구 설치",
              link: "/guide/install"
            },
            {
              text: "CLI 사용법",
              link: "/guide/cli"
            },
            {
              text: "설정 (config.toml)",
              link: "/guide/config"
            },
            {
              text: "GUI 사용법",
              link: "/guide/gui"
            },
            {
              text: "마이그레이션",
              link: "/guide/migration"
            }
          ]
        }
      ]
    },

    outline: {
      level: [2, 3],
      label: "목차"
    }
  },

  transformPageData(pageData) {
    const canonicalUrl = `${siteUrl}/${pageData.relativePath}`
      .replace(/\/index\.md$/, "/")
      .replace(/\.md$/, "/");
    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.unshift([
      "link",
      { rel: "canonical", href: canonicalUrl }
    ]);
    return pageData;
  }
});
