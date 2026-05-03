/**
 * This file is part of NetraX.
 * Repository: https://github.com/jigarvarma2k20/NetraX
 *
 * Copyright (c) 2026 NetraX Contributors
 *
 * SPDX-License-Identifier: GPL-3.0
 */


export default function Header({ title }) {
  return (
    <div className="px-4 pt-4 pb-2 flex items-center justify-between">
      <h2 className="text-sm font-medium text-white">{title}</h2>
    </div>
  );
}
