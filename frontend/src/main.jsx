/**
 * This file is part of NetraX.
 * Repository: https://github.com/jigarvarma2k20/NetraX
 *
 * Copyright (c) 2026 NetraX Contributors
 *
 * SPDX-License-Identifier: GPL-3.0
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const container = document.getElementById('root')

const root = createRoot(container)

root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
