import { defineConfig } from "vitepress";

const ogTitle = "cppx";
const ogDescription = "Windows용 Cargo 스타일 C++ 워크플로";
const ogUrl = "https://cppx.andongmin.com";
const ogImage = "https://cppx.andongmin.com/logo.png";

export default defineConfig({
  title: "cppx",
  description: "Windows용 Cargo 스타일 C++ 워크플로",

  head: [
    ["link", { rel: "icon", type: "image/png", href: "/logo.png" }],
    ["link", { rel: "organization", href: "https://github.com/andongmin94" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: ogTitle }],
    ["meta", { property: "og:image", content: ogImage }],
    ["meta", { property: "og:url", content: ogUrl }],
    ["meta", { property: "og:description", content: ogDescription }],
    ["meta", { name: "theme-color", content: "#237AF5" }],
  ],

  themeConfig: {
    logo: "/logo.svg",

    editLink: {
      pattern:
        "https://mail.google.com/mail/?view=cm&fs=1&to=andongmin94@gmail.com&su=cppx%20문의&body=",
      text: "Gmail로 문의하기",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/andongmin94/cppx" },
    ],

    sidebarMenuLabel: "메뉴",

    returnToTopLabel: "위로 가기",

    darkModeSwitchLabel: "다크 모드",

    docFooter: {
      prev: "이전 페이지",
      next: "다음 페이지",
    },

    footer: {
      message: "Released under the MIT License",
      copyright: "Copyright © 2025 안동민",
    },

    nav: [
      { text: "cppx 가이드", link: "/guide", activeMatch: "/guide" },
      { text: "cppx 개발자", link: "/maintainer" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "cppx 가이드",
          items: [
            {
              text: "cppx 시작하기",
              link: "/guide/",
            },
            {
              text: "도구 설치",
              link: "/guide/install",
            },
            {
              text: "CLI 사용법",
              link: "/guide/cli",
            },
            {
              text: "설정 (config.toml)",
              link: "/guide/config",
            },
            {
              text: "GUI 사용법",
              link: "/guide/gui",
            },
          ],
        },
      ],
    },

    outline: {
      level: [2, 3],
      label: "목차",
    },
  },

  transformPageData(pageData) {
    const canonicalUrl = `${ogUrl}/${pageData.relativePath}`
      .replace(/\/index\.md$/, "/")
      .replace(/\.md$/, "/");
    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.unshift([
      "link",
      { rel: "canonical", href: canonicalUrl },
    ]);
    return pageData;
  },
});
