# CDU 专区界面依据

- 学校：成都大学（CDU），与成都理工大学（CDUT）专区分开。
- 官方校标来源：https://www.cdu.edu.cn/images/f_logo.svg ，项目资产：`apps/electron/src/renderer/assets/cdu-logo.svg`；直接使用原始 SVG，不重绘校标。
- 沿用应用 Tailwind 语义主题：`primary`、`primary-foreground`、`card`、`background`、`muted`、`muted-foreground`。不覆盖用户主题。
- 字体沿用应用系统字体；大圆角卡片、轻阴影与四个只读类别入口，窗口控制条复用 `WindowControlsHost`。
- 状态覆盖未连接、等待认证、等待扫码/短信、已验证、过期、错误；空白页不填充模拟个人数据。导入预览与实时页面结果均显示来源、学期、学号及获取时间。
- 学校窗口与应用权限隔离；用户在学校窗口处理密码、短信和扫码，应用中不提供密码输入框。
