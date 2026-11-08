function paintReportsSearch(main) {
  main.className = "is-reports";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Reports", "Search"],
    title: "Search",
    note: "Search bug reports and user or server reports.",
    clock: "est"
  }));
}

function paintReportsFeedback(main) {
  main.className = "is-reports";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Reports", "Feedback"],
    title: "Feedback",
    note: "General inquiries and feature requests.",
    clock: "est"
  }));
}

function paintReportsAuto(main) {
  main.className = "is-reports";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Reports", "Auto Reports"],
    title: "Auto Reports",
    note: "Reports made by auto moderation.",
    clock: "est"
  }));
}

function paintReports(main, sectionId) {
  if (sectionId === "feedback") return paintReportsFeedback(main);
  if (sectionId === "auto") return paintReportsAuto(main);
  paintReportsSearch(main);
}

registerAdminPage({
  id: "reports",
  label: "Reports",
  sections: [
    { id: "search", label: "Search", icon: "flag" },
    { id: "feedback", label: "Feedback", icon: "activity" },
    { id: "auto", label: "Auto Reports", icon: "shield" }
  ],
  paint: paintReports
});
